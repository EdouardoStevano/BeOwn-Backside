# ─────────────────────────────────────────────────────────────────────────────
# Image de PRODUCTION — BeOwn Backend (NestJS)
#
# Ce que corrige cette version par rapport à la précédente :
#   1. l'étape d'exécution installait TOUTES les dépendances (`npm install`),
#      devDependencies comprises : le compilateur TypeScript, ts-node, jest,
#      eslint et leurs arbres partaient en production. Environ 400 Mo inutiles,
#      et surtout une surface d'attaque (et de CVE à suivre) sans rapport avec
#      ce que le service exécute réellement ;
#   2. `npm install` recalculait l'arbre de dépendances au lieu de suivre
#      package-lock.json : l'image livrée pouvait ne pas correspondre à ce que
#      la CI avait testé ;
#   3. le conteneur tournait en root ;
#   4. aucun HEALTHCHECK : `docker ps` affichait « Up » sur un process incapable
#      de répondre.
# ─────────────────────────────────────────────────────────────────────────────

# ── Étape 1 : compilation ────────────────────────────────────────────────────
# Version épinglée au correctif (jamais `latest`, ni même `22-alpine`) : deux
# builds du même commit doivent produire le même binaire.
FROM node:22.20.0-alpine AS builder

WORKDIR /app

# Les dépendances AVANT le code source : tant que package*.json ne change pas,
# Docker réutilise le cache de cette couche et saute le `npm ci`.
COPY package.json package-lock.json ./

# `npm ci` (et non `npm install`) : installe exactement le lockfile, échoue si
# package.json et package-lock.json divergent. Ici on garde les devDependencies,
# le compilateur TypeScript en fait partie.
RUN npm ci

COPY . .

RUN npm run build


# ── Étape 2 : exécution ──────────────────────────────────────────────────────
FROM node:22.20.0-alpine AS runtime

# Positionné AVANT le `npm ci` : npm s'en sert pour ignorer les devDependencies,
# et l'application le lit au démarrage (bascule des drivers mail/SMS, activation
# des gardes fail-closed CAPTCHA et /metrics).
ENV NODE_ENV=production

WORKDIR /app

COPY package.json package-lock.json ./

# `--omit=dev` : uniquement les dépendances d'exécution.
# `npm cache clean` : le cache npm n'a aucune utilité dans une image figée et
# pèse plusieurs dizaines de Mo.
RUN npm ci --omit=dev && npm cache clean --force

# Le code compilé, et RIEN d'autre — ni tsconfig*.json, ni le reste de src/,
# ni database/ (les seeds ne doivent pas être atteignables depuis un pod de
# production ; le seed réécrit le schéma).
COPY --from=builder /app/dist ./dist

# ⚠ DEUX exceptions, vérifiées dans le code, sans lesquelles l'image démarre
# mais se comporte mal :
#
#   1. src/shared/email/templates/*.hbs — email-template.service.ts les lit à
#      l'EXÉCUTION depuis `process.cwd()/src/shared/email/templates` (le commentaire
#      du fichier le dit explicitement : « lus à l'exécution, pas compilés dans
#      dist/ »). Sans eux, tout envoi d'email retombant sur un template de
#      fichier échoue — activation de compte comprise.
#      Seul CE sous-dossier est copié : pas le reste de src/.
#
#   2. images/ — main.ts sert `process.cwd()/images` en statique public. C'est
#      la vignette que les applications authenticator téléchargent via le
#      paramètre `image` de l'URI otpauth (enrôlement TOTP).
#
# À terme, ces deux dossiers gagneraient à être déclarés en `assets` dans
# nest-cli.json pour atterrir dans dist/ au build ; en attendant, les copier
# explicitement est le comportement exact d'aujourd'hui, rendu visible.
COPY --from=builder /app/src/shared/email/templates ./src/shared/email/templates
COPY --from=builder /app/images ./images

# L'image node fournit déjà un utilisateur `node` (uid 1000) non privilégié.
# Le processus n'a besoin d'écrire nulle part dans l'arborescence : les fichiers
# restent la propriété de root, en lecture seule pour `node`.
USER node

EXPOSE 8080

# Sonde de conteneur — distincte des probes Kubernetes (elles restent la
# référence en cluster : voir k8s/base/deployment.yaml), utile pour
# docker-compose et pour tout diagnostic à la main.
# `/health` est @Public et @SkipThrottle : la sonde ne consomme pas de budget
# de limitation de débit. Forme shell pour interpoler PORT (8080 via le
# ConfigMap, valeur de repli alignée sur EXPOSE).
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider "http://127.0.0.1:${PORT:-8080}/health" || exit 1

# ⚠ Borne de tas V8 (--max-old-space-size) VOLONTAIREMENT ABSENTE ici.
#
# Sans borne, V8 dimensionne son vieux tas sur la mémoire de la MACHINE et non
# sur le cgroup : sous saturation, le process dépasse la limite du conteneur et
# se fait tuer (OOMKilled) sans trace applicative. La borne est donc
# obligatoire — mais elle dépend de la limite mémoire de l'ORCHESTRATEUR, que
# l'image ne connaît pas. La figer ici la rendrait fausse partout ailleurs.
#
# Elle est posée à l'exécution, via NODE_OPTIONS :
#   - Kubernetes : k8s/base/deployment.yaml (384 Mio pour limits.memory 512Mi,
#     soit 75 % ; le reste couvre le tas natif, les piles et le JIT) ;
#   - docker-compose / lancement manuel : passer NODE_OPTIONS au conteneur avec
#     la même règle, en regard du `mem_limit` retenu.
CMD ["node", "./dist/main.js"]
