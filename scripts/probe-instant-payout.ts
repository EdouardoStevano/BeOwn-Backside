/* eslint-disable no-console */
/**
 * SONDE JETABLE — Instant Payout Stripe Connect vers carte de débit (Lot 4a).
 *
 * Objectif : vérifier EN MODE TEST, avant d'écrire le code métier, ce que le
 * compte plateforme BeOwn (FR / EUR) autorise réellement :
 *   a) création d'un compte connecté avec tos_acceptance + capability transfers ;
 *   b) attachement de cartes de débit comme external accounts ;
 *   c) lecture de `available_payout_methods` sur chaque external account ;
 *   d) Transfer plateforme -> compte connecté ;
 *   e) lecture de `balance.instant_available` dans le contexte du compte ;
 *   f) Payout `method: 'instant'` avec `destination` = external account.
 *
 * Chaque étape est isolée : un échec est journalisé (code + message Stripe) et
 * la sonde continue, pour produire un rapport complet en une seule exécution.
 *
 * Exécution :
 *   npx ts-node -r tsconfig-paths/register scripts/probe-instant-payout.ts
 *
 * Options :
 *   --keep        conserve le compte connecté créé (par défaut il est supprimé)
 *   --no-transfer saute les étapes d) e) f) (lecture seule, aucun mouvement)
 *
 * SÉCURITÉ : la sonde n'utilise QUE des tokens de test Stripe (tok_*) et des
 * IBAN de test documentés. Aucun PAN, aucun CVC, aucune donnée réelle. La clé
 * secrète est lue depuis .env et n'est jamais journalisée.
 */
import { config as loadEnv } from 'dotenv';
import Stripe from 'stripe';

loadEnv();

const KEEP = process.argv.includes('--keep');
const SKIP_TRANSFER = process.argv.includes('--no-transfer');

/** Montant du Transfer/Payout de sonde, en centimes (5,00 EUR). */
const PROBE_AMOUNT_MINOR = 500;

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) {
  console.error('STRIPE_SECRET_KEY absent de .env — sonde interrompue.');
  process.exit(1);
}
if (!secretKey.startsWith('sk_test_')) {
  console.error(
    'REFUS : la sonde ne s\'exécute qu\'avec une clé de TEST (sk_test_...). ' +
      'Clé courante non reconnue comme clé de test.',
  );
  process.exit(1);
}

const stripe: any = new Stripe(secretKey, { apiVersion: '2026-04-22.dahlia' });

let step = 0;
const title = (label: string): void => {
  step += 1;
  console.log(`\n${'='.repeat(72)}\n[${step}] ${label}\n${'='.repeat(72)}`);
};

const fail = (label: string, err: any): void => {
  console.log(
    `ECHEC ${label}\n` +
      `  type    : ${err?.type ?? err?.name ?? 'inconnu'}\n` +
      `  code    : ${err?.code ?? err?.raw?.code ?? 'n/a'}\n` +
      `  param   : ${err?.param ?? err?.raw?.param ?? 'n/a'}\n` +
      `  message : ${err?.message ?? String(err)}`,
  );
};

/** Résumé lisible d'un external account (jamais de PAN complet : last4 seulement). */
const describeExternalAccount = (ea: any): string =>
  [
    `id=${ea.id}`,
    `object=${ea.object}`,
    ea.object === 'card'
      ? `brand=${ea.brand} funding=${ea.funding} last4=${ea.last4} exp=${ea.exp_month}/${ea.exp_year}`
      : `bank=${ea.bank_name ?? 'n/a'} last4=${ea.last4}`,
    `currency=${ea.currency}`,
    `country=${ea.country}`,
    `default_for_currency=${ea.default_for_currency}`,
    `available_payout_methods=${JSON.stringify(ea.available_payout_methods ?? null)}`,
  ].join(' ');

async function main(): Promise<void> {
  // ── a0) Compte plateforme ────────────────────────────────────────────────
  title('Compte plateforme (pays / devise / capacités)');
  const platform = await stripe.accounts.retrieve();
  console.log(
    `id=${platform.id} country=${platform.country} ` +
      `default_currency=${platform.default_currency} ` +
      `charges_enabled=${platform.charges_enabled} payouts_enabled=${platform.payouts_enabled}`,
  );

  // ── a) Compte connecté de test ───────────────────────────────────────────
  title('Création du compte connecté (custom, FR, via account token)');
  const nowSec = Math.floor(Date.now() / 1000);
  let accountId: string | null = null;
  try {
    // Une plateforme FR doit créer ses comptes `custom` via un account token
    // (erreur Stripe explicite sinon). Le token porte l'identité + l'acceptation
    // des CGU Stripe (`tos_shown_and_accepted`).
    const accountToken = await stripe.tokens.create({
      account: {
        business_type: 'individual',
        individual: {
          first_name: 'Jean',
          last_name: 'Dupont',
          email: `probe-instant-${nowSec}@example.com`,
          phone: '+33612345678',
          dob: { day: 1, month: 1, year: 1985 },
          address: {
            line1: '10 rue de Rivoli',
            city: 'Paris',
            postal_code: '75004',
            country: 'FR',
          },
          // Valeur de TEST documentée par Stripe pour déclencher la vérification.
          id_number: '000000000',
        },
        tos_shown_and_accepted: true,
      },
    });
    console.log(`account_token=${accountToken.id}`);

    const account = await stripe.accounts.create({
      type: 'custom',
      country: 'FR',
      email: `probe-instant-${nowSec}@example.com`,
      account_token: accountToken.id,
      capabilities: { transfers: { requested: true } },
      business_profile: {
        mcc: '6513',
        url: 'https://accessible.stripe.com',
        product_description: 'Sonde technique instant payout (test mode)',
      },
      // Payouts manuels : indispensable pour piloter nous-mêmes le payout instant.
      settings: { payouts: { schedule: { interval: 'manual' } } },
      metadata: { probe: 'instant-payout-lot4a' },
    });
    accountId = account.id;
    console.log(
      `OK account=${account.id} country=${account.country} ` +
        `default_currency=${account.default_currency} ` +
        `payouts_enabled=${account.payouts_enabled} ` +
        `capabilities=${JSON.stringify(account.capabilities)} ` +
        `requirements.currently_due=${JSON.stringify(account.requirements?.currently_due ?? [])}`,
    );
  } catch (err) {
    fail('création du compte connecté', err);
    return;
  }

  // ── b) Attachement de 2 cartes de débit de test ──────────────────────────
  title('Attachement de 2 cartes de débit de test (external accounts)');
  const cardTokens = ['tok_visa_debit', 'tok_mastercard_debit'];
  const attachedCards: any[] = [];
  for (const tok of cardTokens) {
    try {
      const ea = await stripe.accounts.createExternalAccount(accountId, {
        external_account: tok,
      });
      attachedCards.push(ea);
      console.log(`OK   ${tok} -> ${describeExternalAccount(ea)}`);
    } catch (err) {
      fail(`attachement carte ${tok}`, err);
    }
  }

  // ── b bis) Cartes de test NON-US (le refus ci-dessus vise les cartes US) ──
  title('Attachement de cartes de test non-US (tokenisées côté serveur)');
  // Numéros de TEST publics Stripe (aucune donnée porteur réelle) : le préfixe
  // 400000 + code pays ISO 3166 numérique force le pays émetteur.
  const testCards: Array<{ label: string; number: string }> = [
    { label: 'FR (250) Visa', number: '4000002500000003' },
    { label: 'GB (826) Visa', number: '4000008260000000' },
    { label: 'US Visa debit', number: '4000056655665556' },
  ];
  for (const card of testCards) {
    try {
      const token = await stripe.tokens.create(
        {
          card: {
            number: card.number,
            exp_month: 12,
            exp_year: new Date().getFullYear() + 3,
            cvc: '123',
            currency: 'eur',
          },
        },
        { stripeAccount: accountId },
      );
      console.log(
        `token ${card.label} -> ${token.id} ` +
          `(brand=${token.card?.brand} funding=${token.card?.funding} ` +
          `country=${token.card?.country} last4=${token.card?.last4})`,
      );
      const ea = await stripe.accounts.createExternalAccount(accountId, {
        external_account: token.id,
      });
      attachedCards.push(ea);
      console.log(`OK   ${card.label} -> ${describeExternalAccount(ea)}`);
    } catch (err) {
      fail(`attachement carte ${card.label}`, err);
    }
  }

  // ── b ter) Repli SEPA : IBAN de test (compare l'éligibilité instant) ─────
  title('Repli SEPA — attachement d\'un IBAN de test (comparaison)');
  let sepaAccount: any = null;
  try {
    sepaAccount = await stripe.accounts.createExternalAccount(accountId, {
      external_account: {
        object: 'bank_account',
        country: 'FR',
        currency: 'eur',
        account_holder_name: 'Jean Dupont',
        account_holder_type: 'individual',
        account_number: 'FR1420041010050500013M02606', // IBAN de test Stripe
      },
    });
    console.log(`OK   IBAN test -> ${describeExternalAccount(sepaAccount)}`);
  } catch (err) {
    fail('attachement IBAN de test', err);
  }

  // ── c) Relecture des external accounts (available_payout_methods) ────────
  title('Relecture des external accounts du compte connecté');
  try {
    const list = await stripe.accounts.listExternalAccounts(accountId, {
      limit: 10,
    });
    console.log(`total=${list.data.length}`);
    for (const ea of list.data) console.log(`  - ${describeExternalAccount(ea)}`);
  } catch (err) {
    fail('listExternalAccounts', err);
  }

  if (SKIP_TRANSFER) {
    console.log('\n--no-transfer : étapes d/e/f ignorées.');
    await cleanup(accountId);
    return;
  }

  // ── d) Transfer plateforme -> compte connecté ────────────────────────────
  title('Transfer plateforme -> compte connecté');
  const platformBalance = await stripe.balance.retrieve();
  console.log(
    `solde plateforme available=${JSON.stringify(platformBalance.available)} ` +
      `pending=${JSON.stringify(platformBalance.pending)}`,
  );
  let transferId: string | null = null;
  try {
    const transfer = await stripe.transfers.create({
      amount: PROBE_AMOUNT_MINOR,
      currency: 'eur',
      destination: accountId,
      metadata: { probe: 'instant-payout-lot4a' },
    });
    transferId = transfer.id;
    console.log(
      `OK transfer=${transfer.id} amount=${transfer.amount} ${transfer.currency} ` +
        `destination=${transfer.destination}`,
    );
  } catch (err) {
    fail('transfers.create', err);
  }

  // ── e) Solde du compte connecté avec instant_available ───────────────────
  title('Solde du compte connecté (expand instant_available)');
  try {
    const balance = await stripe.balance.retrieve(
      { expand: ['instant_available'] },
      { stripeAccount: accountId },
    );
    console.log(`available        = ${JSON.stringify(balance.available)}`);
    console.log(`pending          = ${JSON.stringify(balance.pending)}`);
    console.log(`instant_available= ${JSON.stringify(balance.instant_available ?? null)}`);
  } catch (err) {
    fail('balance.retrieve (compte connecté)', err);
  }

  // ── f) Payout instant vers la carte ──────────────────────────────────────
  title('Payout method=instant destination=<carte>');
  const target = attachedCards[0];
  if (!target) {
    console.log(
      'AUCUNE carte attachée — payout instant vers carte non testable. ' +
        'Voir l\'échec de l\'étape [3].',
    );
  } else {
    try {
      const payout = await stripe.payouts.create(
        {
          amount: PROBE_AMOUNT_MINOR,
          currency: 'eur',
          method: 'instant',
          destination: target.id,
          metadata: { probe: 'instant-payout-lot4a' },
        },
        { stripeAccount: accountId },
      );
      console.log(
        `OK payout=${payout.id} status=${payout.status} method=${payout.method} ` +
          `destination=${payout.destination} arrival_date=${payout.arrival_date}`,
      );
    } catch (err) {
      fail('payouts.create (instant, carte)', err);
    }
  }

  // ── f bis) Payout instant vers l'IBAN (comparaison) ──────────────────────
  title('Payout method=instant destination=<IBAN SEPA> (comparaison)');
  if (!sepaAccount) {
    console.log('Aucun IBAN attaché — étape ignorée.');
  } else {
    try {
      const payout = await stripe.payouts.create(
        {
          amount: PROBE_AMOUNT_MINOR,
          currency: 'eur',
          method: 'instant',
          destination: sepaAccount.id,
          metadata: { probe: 'instant-payout-lot4a-sepa' },
        },
        { stripeAccount: accountId },
      );
      console.log(
        `OK payout=${payout.id} status=${payout.status} method=${payout.method} ` +
          `destination=${payout.destination}`,
      );
    } catch (err) {
      fail('payouts.create (instant, IBAN)', err);
    }
  }

  // ── f ter) Payout standard (référence) ───────────────────────────────────
  title('Payout method=standard (référence)');
  try {
    const payout = await stripe.payouts.create(
      {
        amount: PROBE_AMOUNT_MINOR,
        currency: 'eur',
        method: 'standard',
        metadata: { probe: 'instant-payout-lot4a-standard' },
      },
      { stripeAccount: accountId },
    );
    console.log(
      `OK payout=${payout.id} status=${payout.status} method=${payout.method} ` +
        `destination=${payout.destination}`,
    );
  } catch (err) {
    fail('payouts.create (standard)', err);
  }

  // ── g) CRUD external accounts : exactement les appels de l'adapter ───────
  title('CRUD external accounts (appels utilisés par StripePayoutMethodsService)');
  if (sepaAccount) {
    try {
      const updated = await stripe.accounts.updateExternalAccount(
        accountId,
        sepaAccount.id,
        { default_for_currency: true },
      );
      console.log(`OK setDefault -> ${describeExternalAccount(updated)}`);
    } catch (err) {
      fail('updateExternalAccount (default_for_currency)', err);
    }

    try {
      const re = await stripe.accounts.retrieveExternalAccount(
        accountId,
        sepaAccount.id,
      );
      console.log(`OK retrieveExternalAccount -> ${describeExternalAccount(re)}`);
    } catch (err) {
      fail('retrieveExternalAccount (propriétaire légitime)', err);
    }
  }

  // Anti-IDOR : un id d'external account qui n'appartient pas au compte doit
  // être rejeté par Stripe (c'est la garantie sur laquelle s'appuie l'adapter).
  title('Anti-IDOR : external account d\'un AUTRE compte connecté');
  let otherAccountId: string | null = null;
  try {
    const otherToken = await stripe.tokens.create({
      account: {
        business_type: 'individual',
        individual: {
          first_name: 'Marie',
          last_name: 'Martin',
          email: `probe-other-${nowSec}@example.com`,
          phone: '+33612345679',
          dob: { day: 2, month: 2, year: 1990 },
          address: {
            line1: '5 avenue Foch',
            city: 'Paris',
            postal_code: '75116',
            country: 'FR',
          },
          id_number: '000000000',
        },
        tos_shown_and_accepted: true,
      },
    });
    const other = await stripe.accounts.create({
      type: 'custom',
      country: 'FR',
      email: `probe-other-${nowSec}@example.com`,
      account_token: otherToken.id,
      capabilities: { transfers: { requested: true } },
      business_profile: {
        mcc: '6513',
        url: 'https://accessible.stripe.com',
        product_description: 'Sonde technique instant payout (test mode)',
      },
      settings: { payouts: { schedule: { interval: 'manual' } } },
      metadata: { probe: 'instant-payout-lot4a-other' },
    });
    otherAccountId = other.id;
    const otherEa = await stripe.accounts.createExternalAccount(other.id, {
      external_account: {
        object: 'bank_account',
        country: 'FR',
        currency: 'eur',
        account_holder_name: 'Marie Martin',
        account_holder_type: 'individual',
        account_number: 'FR1420041010050500013M02606',
      },
    });
    console.log(`compte B=${other.id} external account B=${otherEa.id}`);
    try {
      await stripe.accounts.retrieveExternalAccount(accountId, otherEa.id);
      console.log(
        'ALERTE : Stripe a accepté la lecture d\'un external account d\'un AUTRE compte !',
      );
    } catch (err) {
      fail('retrieveExternalAccount (compte A -> external account de B) [attendu]', err);
    }
  } catch (err) {
    fail('préparation du compte B', err);
  }

  // ── h) Suppression ───────────────────────────────────────────────────────
  title('Suppression d\'un external account');
  if (sepaAccount) {
    try {
      const del = await stripe.accounts.deleteExternalAccount(
        accountId,
        sepaAccount.id,
      );
      console.log(`OK delete -> id=${del.id} deleted=${del.deleted}`);
    } catch (err) {
      fail('deleteExternalAccount', err);
    }
  }

  if (transferId) console.log(`\n(transfer de sonde : ${transferId})`);
  await cleanup(accountId);
  await cleanup(otherAccountId);
}

async function cleanup(accountId: string | null): Promise<void> {
  title('Nettoyage');
  if (!accountId) return;
  if (KEEP) {
    console.log(`--keep : compte ${accountId} conservé.`);
    return;
  }
  try {
    await stripe.accounts.del(accountId);
    console.log(`Compte de sonde supprimé : ${accountId}`);
  } catch (err) {
    fail(`suppression du compte ${accountId}`, err);
  }
}

main().catch((err) => {
  fail('sonde', err);
  process.exit(1);
});
