# Graph Report - BeOwn-Backside  (2026-09-02)

## Corpus Check
- 770 files · ~430,180 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 6122 nodes · 17095 edges · 328 communities (222 shown, 106 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 14 edges (avg confidence: 0.67)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b73e18f6`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- authentication.module.ts
- UserRepository
- UserEntity
- ProjectEntity
- porteur.controller.ts
- TransactionEntity
- mfa.usecases.spec.ts
- register.usecase.ts
- DeleteAccountDto
- SessionCacheService
- seed.service.improved.ts
- ProfilPPEntity
- app.module.ts
- fici.ts
- WalletController
- project-kpi.service.ts
- avis.controller.ts
- ProjectStatus
- ReclamationsController
- oauth-redirect-cookie.ts
- .constructor
- Bail
- DeleteAccountUseCase
- Charge
- projects.module.ts
- calculate-distribution-periode.usecase.ts
- ProfilPMEntity
- ActiveUser
- UniteLouableEntity
- profile.controller.ts
- secondary-market.controller.ts
- ProjectController
- User
- StatutDeclaration
- ExecuteDistributionUseCase
- email-driver.provider.ts
- retractation.ts
- PaymentController
- email.service.ts
- investor-classification.ts
- Document
- DistributionPart
- AdminController
- SeedService
- ProfileController
- email-template.service.ts
- RequirePermission
- CurrentUser
- InvestmentController
- DocumentFiscal
- .exprimerInteret
- .push
- PorteurController
- AdminLocativeController
- SmsService
- InvestmentRepository
- profil-investor-identity.adapter.ts
- AdminNewsController
- payout-methods.port.ts
- locative-management-infrastructure.module.ts
- kyc-validated.guard.ts
- devDependencies
- PrometheusMetricsAdapter
- .ecrire
- AdminExportsController
- GetPorteurTresorerieUseCase
- tableau-affichage.ts
- CLAUDE.md
- AdminDistributionsController
- NotificationController
- CreateProjectDto
- seed.service.ts
- Reservation
- taux-defaut-publication.ts
- notification-unsubscribe.service.spec.ts
- CreateRetraitDto
- update-admin-settings.dto.ts
- stripe-identity-kyc-document.adapter.ts
- profiles.module.ts
- compilerOptions
- IfuGenerationService
- reservations.module.ts
- admin-settings.controller.ts
- Public
- PayoutMethodsController
- OtpRecordStore
- Seed Service Amélioré
- AdminEmailTemplatesController
- TransactionalEmailNotifier
- MfaMethod
- UpdatePreferencesDto
- SpvEntity
- .declarerVersement
- AdminReservationsController
- BroadcastService
- .verser
- stripe-identity.service.ts
- .adminCancel
- scripts
- DeclarerVersementPorteurDto
- YouSignService
- authentication.controller.ts
- .generate
- AdminRetraitsController
- SocialProfile
- .testEmail
- EmailService
- AdminInvestorsController
- StripePaymentService
- ProjectLedgerService
- HealthController
- Checklist de mise en service — BeOwn
- Lot 1 — Foundations (KpiCalculator + statuts + migrations) Implementation Plan
- FiciDto
- jest
- round2
- AdminSortiesController
- AuditLogController
- fiscalite.module.ts
- reclamations.controller.ts
- StripeConnectService
- Runbook de lancement — BeOwn
- exclude
- CreateOrdreMarcheDto
- .closeCollecte
- CgpController
- manage-payout-methods.usecase.ts
- ProfilPP
- InMemoryPayoutMethodsAdapter
- broadcast.service.ts
- jwt-token-signer.adapter.ts
- TemplatedEmailService
- Lot 2 — Investor + Project KPIs Implementation Plan
- Design — Indicateurs financiers crowdlending obligataire (KPIs BeOwn)
- probe-cache-redis.ts
- InvestisseurDistributionsController
- RedisThrottlerStorage
- CreateBailDto
- ReclamationEntity
- dependencies
- SeedService
- Lot 3 — Admin KPIs, Crons & Marketing Implementation Plan
- ADR — Grand livre interne : crédit du wallet projet et invariant comptable
- ADR — Retrait par carte et versement instantané (Stripe Instant Payout)
- Environnement de test local — BeOwn
- Plan de Gestion Extinctive (Run-off) — BeOwn
- AdminComplianceController
- SecondaryMarketController
- SignUpDto
- chronologie-status.ts
- ReservationEntity
- Suivis sécurité & config prod — 2026-07-21
- logger.config.ts
- admin-email-templates.controller.ts
- DeclareLoyerDto
- UpdateBailDto
- test-endpoints.policy.ts
- AdminPlatformWalletController
- audit.interceptor.ts
- AdminRetraitsReapController
- UploadDocumentDto
- yousign-webhook.controller.spec.ts
- ADR — Le grand livre n'a que deux colonnes de portefeuille (suppression du doublon `wallet_source`)
- probe-instant-payout.ts
- EmailTemplateService
- 4. Stripe
- UpdateEcheanceDto
- index.ts
- AdminTransactionsLitigesController
- package.json
- CancelReservationUseCase
- À la charge du fondateur
- 3. Variables d'environnement et secrets
- CreateTransactionDto
- 15. Contenu marketing à remplacer
- 4. Domain — `KpiCalculator` (cœur testable)
- 8. Statuts & crons
- formatEur
- nest-cli.json
- route-permissions.hardening.spec.ts
- ConfirmRetractationCronService
- InvestisseurFiscaliteController
- LivreSeed
- EmailTemplateEntity
- ReconciliationService
- 1. Carte du système
- 6. Base de données
- 7. CI/CD — Jenkins et déclenchement par GitHub
- README.md
- SetPepFlagDto
- PayEcheanceUseCase
- safe-html.ts
- InitiateInvestmentDto
- PlatformFeesService
- KycEntity
- BaseSchema1000000000000
- AddDocumentImageFields1746316800000
- AddProjectRichFields1746316900000
- AddPsfpFieldsToProfilPP1747524600000
- AddFiscalFieldsToEcheance1747528000000
- CreateQuestionnaireAdequation1747528500000
- AddRiskScoringToProfilPP1747530000000
- CreateBeneficiaireEffectif1747530500000
- InitSchema1774324306313
- AddEcheanceReminderFlags1778831051000
- AddCgpFields1778900000000
- AddFiscalRegimeToUser1779000000000
- ExtendEcheanceStatusAndAddChangeTimestamp1779000000001
- AddIndiceRisqueToProjet1779100000000
- AddMissingColumnsToProfilPP1780000000000
- Comment se servir de ce document
- 1. Contexte et problème
- 6. Application — Project KPI Service (cache 5 min)
- 7. Application — Admin KPI Service (snapshot quotidien)
- 9. Migrations TypeORM
- UpdateReservationAdminDto
- MfaMethodEntity
- ADR — Migrations TypeORM retirées du pipeline de déploiement
- save-test-connaissances.usecase.ts
- InitSchema1780895612145
- InitSchema1780898979269
- InitSchema1780899617108
- RenameAdminToSuperAdmin1782000000000
- AuditLogVarcharAndIndexes1782000000001
- PeriodeDistributionFraisColumns1782100000000
- InitSchema1782891038377
- InitSchema1782895042057
- WalletDeviseEurBase1782900000000
- CreateEmailTemplates1782910000000
- ProjectBroadcastTimestamps1782930000000
- ReservationProjectRankUnique1783000000000
- AddStripeConnectAndProjectView1783100000000
- MergeTfaMethodsIntoMfaMethods1783200000000
- SingleActiveMfaMethod1783300000000
- ADR — Limitation de débit : fail-open par défaut, fail-closed ciblé
- AddUniteLouableDto
- payout-methods.contract.spec.ts
- update-project-status.usecase.spec.ts
- reservation.controller.ts
- cache-manager
- class-transformer
- cloudinary
- DepotCleanupCronService
- globals
- helmet
- ioredis
- jest
- @keyv/redis
- @nestjs/common
- @nestjs/config
- @nestjs/core
- @nestjs/cqrs
- CreateReclamationDto
- @getbrevo/brevo
- nestjs-pino
- @nestjs/platform-express
- @nestjs/platform-socket.io
- @nestjs/schedule
- @nestjs/terminus
- @nestjs/throttler
- @nestjs/typeorm
- @nestjs/websockets
- RetraitsReaperService
- HttpMetricsInterceptor
- @opentelemetry/auto-instrumentations-node
- @opentelemetry/exporter-trace-otlp-http
- connect-prefill.ts
- @opentelemetry/sdk-node
- @opentelemetry/semantic-conventions
- otplib
- passport
- passport-facebook
- ContactDto
- pdfkit
- pg
- pino
- RecaptchaService
- prom-client
- qrcode
- AesGcmSecretCipherAdapter
- seed.ts
- CalculateDistributionDto
- socket.io
- swagger-ui-express
- 5. Courriel et SMS
- eslint-config-prettier
- @types/pdfkit
- source-map-support
- ts-jest
- ts-loader
- ts-node
- tsconfig-paths
- @types/express
- @types/jest
- @types/multer
- @types/node
- @types/nodemailer
- @types/passport-facebook
- @types/passport-google-oauth20
- @eslint/eslintrc
- @types/twilio
- typescript
- typescript-eslint
- assign-project-porteur.js
- set-user-role.js
- verify-test-user.js
- data-source.ts
- redirect-url.ts
- @nestjs/cli
- UpdateUserStatusDto
- .constructor
- payment.controller.apport-porteur.spec.ts
- @nestjs/event-emitter
- SignInDto
- class-validator
- @nestjs/mapped-types
- @nestjs/schematics
- @nestjs/swagger
- RolesGuard
- @nestjs/testing
- prettier
- supertest
- @types/bcrypt
- @types/passport-linkedin-oauth2
- @types/supertest

## God Nodes (most connected - your core abstractions)
1. `ActiveUser` - 281 edges
2. `CurrentUser` - 240 edges
3. `UserEntity` - 159 edges
4. `ProjectEntity` - 122 edges
5. `InvestmentEntity` - 109 edges
6. `RequirePermission()` - 103 edges
7. `TransactionEntity` - 100 edges
8. `formatEur()` - 99 edges
9. `WalletEntity` - 98 edges
10. `MetricsPort` - 96 edges

## Surprising Connections (you probably didn't know these)
- `MouvementSeed` --references--> `TransactionStatus`  [EXTRACTED]
  database/seeds/seed-ledger.ts → src/wallets/domains/enums/wallet.enum.ts
- `UserData` --references--> `UserRole`  [EXTRACTED]
  database/seeds/seed.service.improved.ts → src/iam/domains/enums/user.enum.ts
- `LivreSeed` --references--> `EcritureGrandLivre`  [EXTRACTED]
  database/seeds/seed-ledger.ts → src/wallets/domains/grand-livre.ts
- `SeedService` --references--> `UserEntity`  [EXTRACTED]
  database/seeds/seed.service.improved.ts → src/iam/infrastructure/persistence/entities/user.entity.ts
- `SeedService` --references--> `InvestmentEntity`  [EXTRACTED]
  database/seeds/seed.service.improved.ts → src/investments/infrastructure/persistences/entities/investment.entity.ts

## Import Cycles
- None detected.

## Communities (328 total, 106 thin omitted)

### Community 0 - "authentication.module.ts"
Cohesion: 0.03
Nodes (82): AuthenticationModule, Module, OTP_RECORD_STORE, SECRET_CIPHER, SecretCipher, TOTP_GENERATOR, TotpGenerator, TotpUriParams (+74 more)

### Community 1 - "UserRepository"
Cohesion: 0.03
Nodes (63): EventsHandler, BcryptService, Injectable, HASHING_SERVICE, HashingService, build(), event, Inject (+55 more)

### Community 2 - "UserEntity"
Cohesion: 0.05
Nodes (60): ADMIN_ROLES, MONTH_LABELS, InjectRepository, ADMIN_ROLES, ADMIN_ROLES, ADMIN_ROLES, PLATFORM_FEE_SOURCES, ADMIN_ROLES (+52 more)

### Community 3 - "ProjectEntity"
Cohesion: 0.05
Nodes (68): OneToMany, ADMIN_ROLES, MANAGE_ROLES, InjectRepository, InjectRepository, GetAggregatedScheduleUseCase, round2(), Injectable (+60 more)

### Community 4 - "porteur.controller.ts"
Cohesion: 0.10
Nodes (27): LocativeManagementModule, Module, BAIL_REPOSITORY, BailRepository, UNITE_LOUABLE_REPOSITORY, CreateBailInput, CreateBailUseCase, Inject (+19 more)

### Community 5 - "TransactionEntity"
Cohesion: 0.04
Nodes (66): CANONICAL_SOURCES, InjectRepository, InjectRepository, Inject, InjectRepository, DELAI_ABANDON_DEPOT_JOURS, MOTIF_DEPOT_ABANDONNE, DELAI_ALERTE_SANS_PAYOUT_JOURS (+58 more)

### Community 6 - "mfa.usecases.spec.ts"
Cohesion: 0.04
Nodes (58): RFC-5321, RFC-5322, MFA_CHALLENGE_MAX_ATTEMPTS, MfaChallenge, MfaChallengeDraft, MfaChallengePurpose, key(), MFAChallengeCacheService (+50 more)

### Community 7 - "register.usecase.ts"
Cohesion: 0.13
Nodes (10): asUniqueViolation(), isEmailUniqueViolation(), POSTGRES_UNIQUE_VIOLATION, readCode(), UniqueViolation, RegisterInput, RegisterUseCase, Injectable (+2 more)

### Community 8 - "DeleteAccountDto"
Cohesion: 0.67
Nodes (3): DeleteAccountDto, IsNotEmpty, IsString

### Community 9 - "SessionCacheService"
Cohesion: 0.11
Nodes (10): AuthSession, RedisBackedStore, SessionCacheService, Inject, Injectable, Inject, ExchangeOAuthCodeUseCase, Injectable (+2 more)

### Community 10 - "seed.service.improved.ts"
Cohesion: 0.05
Nodes (50): SEED_ENTITIES, SeedConfig, InjectRepository, UserData, DOCUMENT_REPOSITORY, DocumentRelatedTo, DocumentType, DocumentEntity (+42 more)

### Community 11 - "ProfilPPEntity"
Cohesion: 0.12
Nodes (18): ProfilPPEntity, Column, CreateDateColumn, Entity, JoinColumn, OneToOne, PrimaryColumn, UpdateDateColumn (+10 more)

### Community 12 - "app.module.ts"
Cohesion: 0.07
Nodes (49): AdminModule, Module, AvisModule, Module, CgpModule, Module, AmlModule, Module (+41 more)

### Community 13 - "fici.ts"
Cohesion: 0.07
Nodes (43): ACTUALITES, ActualiteSeed, eur(), ficiComplet(), ficiPartiel(), ParametresFici, makeService(), contenuComplet (+35 more)

### Community 14 - "WalletController"
Cohesion: 0.26
Nodes (11): ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags, Body, Controller, Get (+3 more)

### Community 15 - "project-kpi.service.ts"
Cohesion: 0.06
Nodes (45): RegimeFiscal, InvestorKpiService, Injectable, GRAVITE_LIGNE, GRAVITE_SANTE, KpiCache, LIGNE_PAR_STATUT, ProjectKpiService (+37 more)

### Community 16 - "avis.controller.ts"
Cohesion: 0.06
Nodes (41): Check, AVIS_REPOSITORY, AvisRepository, Avis, AvisInfrastructureModule, Module, AvisEntity, Column (+33 more)

### Community 17 - "ProjectStatus"
Cohesion: 0.11
Nodes (23): ProjectData, Inject, CalculateDistributionPeriodeUseCase, Injectable, PROJECT_REPOSITORY, ProjectRepository, InMemoryProjectRepository, ALLOWED_TRANSITIONS (+15 more)

### Community 18 - "ReclamationsController"
Cohesion: 0.14
Nodes (14): ReclamationsController, ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags, Body, Controller (+6 more)

### Community 19 - "oauth-redirect-cookie.ts"
Cohesion: 0.12
Nodes (17): Social, FacebookAuthGuard, Injectable, FacebookCallbackGuard, Injectable, GoogleAuthGuard, Injectable, GoogleCallbackGuard (+9 more)

### Community 20 - ".constructor"
Cohesion: 0.09
Nodes (14): CreateKycUseCase, Inject, Injectable, GetKycUseCase, Inject, Injectable, GetProfilPPUseCase, Inject (+6 more)

### Community 21 - "Bail"
Cohesion: 0.12
Nodes (13): Bail, StatutBail, BailEntity, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn (+5 more)

### Community 22 - "DeleteAccountUseCase"
Cohesion: 0.16
Nodes (8): InjectRepository, DeleteAccountUseCase, isUniqueViolation(), Inject, Injectable, InjectDataSource, InjectRepository, Inject

### Community 23 - "Charge"
Cohesion: 0.06
Nodes (33): Inject, CHARGE_REPOSITORY, ChargeRepository, DeclareChargeInput, Inject, EtatFinancierPeriode, GetProjectEtatFinancierUseCase, Inject (+25 more)

### Community 24 - "projects.module.ts"
Cohesion: 0.08
Nodes (32): SORTIE_PROJET_REPOSITORY, SortieProjetRepository, ProjectsModule, Module, DeclareSortieInput, DeclareSortieUseCase, round2(), Inject (+24 more)

### Community 25 - "calculate-distribution-periode.usecase.ts"
Cohesion: 0.12
Nodes (20): DISTRIBUTION_PART_REPOSITORY, PERIODE_DISTRIBUTION_REPOSITORY, PeriodeDistributionRepository, CalculateDistributionResult, ExecuteDistributionResult, InvestisseurDistributionPart, InvestisseurDistributionSummary, StatutPeriodeDistribution (+12 more)

### Community 26 - "ProfilPMEntity"
Cohesion: 0.06
Nodes (40): BeneficiaireEffectifEntity, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn (+32 more)

### Community 27 - "ActiveUser"
Cohesion: 0.12
Nodes (24): Redirect, ActiveUser, hasPermission(), parseBooleanish(), toStrictBoolean(), DocumentController, ApiBearerAuth, ApiBody (+16 more)

### Community 28 - "UniteLouableEntity"
Cohesion: 0.11
Nodes (17): UniteLouableRepository, AddUniteLouableInput, AddUniteLouableUseCase, Inject, Injectable, UniteLouable, Column, CreateDateColumn (+9 more)

### Community 29 - "profile.controller.ts"
Cohesion: 0.11
Nodes (22): CreateProfilPMUseCase, Inject, Injectable, CreateProfilPPUseCase, Inject, Injectable, InjectRepository, CreateProfilPMDto (+14 more)

### Community 30 - "secondary-market.controller.ts"
Cohesion: 0.05
Nodes (53): estIndisponibiliteFournisseur(), motifIndisponibilite, SIGNATURE_PROVIDER_UNAVAILABLE, Module, YouSignModule, EmbeddedSignatureResult, AnnoncesExpiryCronService, Injectable (+45 more)

### Community 31 - "ProjectController"
Cohesion: 0.12
Nodes (22): ProjectReadModelService, Inject, Injectable, GetProjectsUseCase, Inject, Injectable, ProjectController, ApiBearerAuth (+14 more)

### Community 32 - "User"
Cohesion: 0.05
Nodes (15): UserPreferences, User, Column, CreateDateColumn, Entity, JoinColumn, OneToOne, PrimaryColumn (+7 more)

### Community 33 - "StatutDeclaration"
Cohesion: 0.08
Nodes (22): LOYER_ENCAISSE_REPOSITORY, LoyerEncaisseRepository, Inject, Injectable, ValidateChargeUseCase, Inject, Injectable, ValidateLoyerEncaisseUseCase (+14 more)

### Community 34 - "ExecuteDistributionUseCase"
Cohesion: 0.19
Nodes (7): DistributionsCronService, Cron, Injectable, ExecuteDistributionUseCase, round2(), Injectable, Inject

### Community 35 - "email-driver.provider.ts"
Cohesion: 0.14
Nodes (10): PlatformSettingsService, Injectable, BrevoEmailService, Injectable, MAIL_DRIVERS, MailDriver, REAL_SEND_ENVIRONMENTS, resolveMailDriver() (+2 more)

### Community 36 - "retractation.ts"
Cohesion: 0.19
Nodes (14): calculerEcheanceRetractation(), CODE_RETRACTATION_DELAI_EXPIRE, CODE_RETRACTATION_NON_APPLICABLE, CODE_RETRACTATION_STATUT_INCOMPATIBLE, DELAI_RETRACTATION_EN_LETTRES, DELAI_RETRACTATION_JOURS, DemandeRetractation, LIBELLE_DELAI_RETRACTATION (+6 more)

### Community 37 - "PaymentController"
Cohesion: 0.08
Nodes (20): ApiHeader, StripeIdentityServiceImpl, Injectable, PaymentController, ApiBearerAuth, ApiOperation, ApiParam, ApiResponse (+12 more)

### Community 38 - "email.service.ts"
Cohesion: 0.11
Nodes (17): ContactController, escapeHtml(), ApiOperation, ApiResponse, ApiTags, Body, Controller, HttpCode (+9 more)

### Community 39 - "investor-classification.ts"
Cohesion: 0.06
Nodes (40): RiskScoringService, Cron, Injectable, InjectRepository, SaveQuestionnaireUseCase, Injectable, InjectRepository, appliquerTestConnaissances() (+32 more)

### Community 40 - "Document"
Cohesion: 0.10
Nodes (8): DocumentRepository, Document, DocumentTypeOrmRepository, Injectable, InjectRepository, InMemoryDocumentRepository, Inject, InjectRepository

### Community 41 - "DistributionPart"
Cohesion: 0.09
Nodes (14): DistributionPartRepository, DistributionPart, DistributionPartEntity, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn (+6 more)

### Community 42 - "AdminController"
Cohesion: 0.12
Nodes (19): ACTIVE_INVESTMENT_STATUSES, AdminController, ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse (+11 more)

### Community 44 - "ProfileController"
Cohesion: 0.17
Nodes (15): ProfileController, ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags, Body, Controller (+7 more)

### Community 45 - "email-template.service.ts"
Cohesion: 0.11
Nodes (18): DEFAULT_TEMPLATE_META, extractCorps(), extractVariables(), INLINE_EXEMPT_CLASSES, inlineVariantStyles(), parseStyleMap(), RenderedEmail, RESERVED_TOKENS (+10 more)

### Community 46 - "RequirePermission"
Cohesion: 0.17
Nodes (20): AdminEcheancesController, AdminEcheancesItemController, PAY_ROLES, ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags (+12 more)

### Community 47 - "CurrentUser"
Cohesion: 0.16
Nodes (17): CurrentUser, ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags, Body, Controller (+9 more)

### Community 48 - "InvestmentController"
Cohesion: 0.16
Nodes (19): Roles(), InvestmentController, ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags, Body (+11 more)

### Community 49 - "DocumentFiscal"
Cohesion: 0.12
Nodes (16): DOCUMENT_FISCAL_REPOSITORY, DocumentFiscalRepository, DocumentFiscal, FiscaliteInfrastructureModule, Module, DocumentFiscalEntity, Column, CreateDateColumn (+8 more)

### Community 50 - ".exprimerInteret"
Cohesion: 0.27
Nodes (10): ApiOperation, ApiParam, ApiResponse, Body, Delete, Get, HttpCode, Param (+2 more)

### Community 51 - ".push"
Cohesion: 0.09
Nodes (3): Cron, Injectable, VerserPorteurUseCase

### Community 52 - "PorteurController"
Cohesion: 0.17
Nodes (13): PorteurController, ApiBearerAuth, ApiOperation, ApiTags, Body, Controller, Get, Param (+5 more)

### Community 53 - "AdminLocativeController"
Cohesion: 0.16
Nodes (14): RejectDeclarationDto, ApiProperty, IsNotEmpty, IsString, AdminLocativeController, ApiBearerAuth, ApiOperation, ApiTags (+6 more)

### Community 54 - "SmsService"
Cohesion: 0.11
Nodes (15): LogSmsService, Injectable, hasTwilioCredentials(), resolveSmsDriver(), SmsDriver, SmsModule, smsServiceFactory(), TWILIO_ENV (+7 more)

### Community 55 - "InvestmentRepository"
Cohesion: 0.06
Nodes (22): InvestmentRepository, ContractData, TopUpInvestmentUseCase, Inject, Injectable, InjectDataSource, Investment, InvestmentTypeOrmRepository (+14 more)

### Community 56 - "profil-investor-identity.adapter.ts"
Cohesion: 0.22
Nodes (6): InvestorIdentity, InvestorIdentityReader, ProfilInvestorIdentityAdapter, Inject, Injectable, InjectRepository

### Community 57 - "AdminNewsController"
Cohesion: 0.12
Nodes (21): AdminNewsController, PublicNewsController, slugify(), ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiQuery (+13 more)

### Community 58 - "payout-methods.port.ts"
Cohesion: 0.18
Nodes (12): ADR-0003, PayoutMethodError, PayoutMethodErrorCode, PayoutMethodKind, PayoutMethodType, ADR-0002, ResolvedPayoutDestination, ResolvePayoutDestinationInput (+4 more)

### Community 59 - "locative-management-infrastructure.module.ts"
Cohesion: 0.13
Nodes (16): LOCATAIRE_REPOSITORY, LocataireRepository, Locataire, LocativeManagementInfrastructureModule, Module, LocataireEntity, Column, CreateDateColumn (+8 more)

### Community 60 - "kyc-validated.guard.ts"
Cohesion: 0.15
Nodes (14): ControllerClass, guardsOf(), hasKycGuard(), KYC_NOT_VALIDATED_CODE, KYC_NOT_VALIDATED_MESSAGE, kycNotValidatedException(), KycValidatedGuard, ctx() (+6 more)

### Community 61 - "devDependencies"
Cohesion: 0.22
Nodes (9): eslint, @eslint/js, eslint-plugin-prettier, devDependencies, eslint, @eslint/js, eslint-plugin-prettier, @types/qrcode (+1 more)

### Community 62 - "PrometheusMetricsAdapter"
Cohesion: 0.12
Nodes (11): Header, MetricName, MetricsController, ApiExcludeController, Controller, Get, Headers, Res (+3 more)

### Community 63 - ".ecrire"
Cohesion: 0.13
Nodes (18): Put, ConsulterDocumentClesUseCase, Inject, Injectable, AdminDocumentClesController, DocumentClesController, gabarit(), ApiBearerAuth (+10 more)

### Community 64 - "AdminExportsController"
Cohesion: 0.14
Nodes (18): RFC-4180, AdminExportsController, ROLES_EXPORT, ADMIN, build(), fakeQueryBuilder(), ApiBearerAuth, ApiOperation (+10 more)

### Community 65 - "GetPorteurTresorerieUseCase"
Cohesion: 0.09
Nodes (19): GetPorteurTresorerieUseCase, Injectable, TresoreriePaginationDto, ApiPropertyOptional, IsInt, IsOptional, Max, Min (+11 more)

### Community 66 - "tableau-affichage.ts"
Cohesion: 0.09
Nodes (29): Cron, arrondi2(), BaseCalculFraisCession, calculerAssietteCession(), CODE_ANNONCE_EXPIREE, CODE_DETENTION_TROP_RECENTE, CODE_PROJET_NON_ELIGIBLE, dateCessibiliteMinimale() (+21 more)

### Community 67 - "CLAUDE.md"
Cohesion: 0.08
Nodes (25): 10. Conventions de nommage, 11. Stratégie de tests (alignée sur les couches), 12. ❌ Interdictions strictes, 13. ✅ Checklist avant de générer du code, 14. Exemple de flux complet — "Créer une commande", 15. Commandes utiles (exemple générique — à adapter au `package.json` réel), 16. Pour aller plus loin, 1. La règle d'or : direction des dépendances (+17 more)

### Community 68 - "AdminDistributionsController"
Cohesion: 0.15
Nodes (13): Inject, Injectable, ValidatePeriodeDistributionUseCase, AdminDistributionsController, ApiBearerAuth, ApiOperation, ApiTags, Body (+5 more)

### Community 69 - "NotificationController"
Cohesion: 0.06
Nodes (24): ConnectedSocket, MessageBody, Inject, InjectRepository, NotificationController, ApiBearerAuth, ApiOperation, ApiParam (+16 more)

### Community 70 - "CreateProjectDto"
Cohesion: 0.13
Nodes (25): IsLatitude, IsLongitude, IsUrl, CreateProjectDto, CreateSpvDto, EtapeChronologieDto, GarantieDto, toNumber() (+17 more)

### Community 71 - "seed.service.ts"
Cohesion: 0.07
Nodes (25): EffetMouvement, CompteInvestisseur, InjectRepository, InvestorInactivityCronService, Injectable, InjectRepository, ADMIN_ROLES, FIXED_MS (+17 more)

### Community 72 - "Reservation"
Cohesion: 0.14
Nodes (4): ReservationRepository, Reservation, ReservationTypeOrmRepository, Injectable

### Community 73 - "taux-defaut-publication.ts"
Cohesion: 0.12
Nodes (18): agreger(), arrondir(), CohorteAnnuelle, construirePublication(), debutPeriodePublication(), METHODOLOGIE_TAUX_DEFAUT, pourcent(), PROFONDEUR_PUBLICATION_MOIS (+10 more)

### Community 74 - "notification-unsubscribe.service.spec.ts"
Cohesion: 0.10
Nodes (18): NotificationUnsubscribeService, buildSignerConfig(), buildTokenService(), buildTtlConfig(), Injectable, PublicUnsubscribeController, ApiOperation, ApiProperty (+10 more)

### Community 75 - "CreateRetraitDto"
Cohesion: 0.23
Nodes (20): AttachPayoutMethodDto, ConfirmDepotDto, ConnectOnboardingDto, CreateApportPorteurDto, CreatePaymentIntentDto, CreateRetraitDto, StartKycVerificationDto, ApiProperty (+12 more)

### Community 76 - "update-admin-settings.dto.ts"
Cohesion: 0.18
Nodes (20): BroadcastChannelTogglesDto, BroadcastSettingsDto, CommissionsSettingsDto, FeatureFlagsSettingsDto, NotificationsSettingsDto, PlatformSettingsDto, ApiPropertyOptional, IsBoolean (+12 more)

### Community 77 - "stripe-identity-kyc-document.adapter.ts"
Cohesion: 0.26
Nodes (6): KycDocumentFace, KycDocumentSource, KycIdentityDocument, StripeIdentityKycDocumentAdapter, Inject, Injectable

### Community 78 - "profiles.module.ts"
Cohesion: 0.10
Nodes (13): PROFIL_REPOSITORY, ProfilRepository, DocumentKycType, KycNiveau, KycStatus, Kyc, KycIdentiteExtrait, ProfilPM (+5 more)

### Community 79 - "compilerOptions"
Cohesion: 0.09
Nodes (22): compilerOptions, allowSyntheticDefaultImports, baseUrl, declaration, emitDecoratorMetadata, esModuleInterop, experimentalDecorators, forceConsistentCasingInFileNames (+14 more)

### Community 80 - "IfuGenerationService"
Cohesion: 0.11
Nodes (14): AdminFiscalController, ApiBearerAuth, ApiOperation, ApiParam, ApiTags, Controller, HttpCode, InjectRepository (+6 more)

### Community 81 - "reservations.module.ts"
Cohesion: 0.29
Nodes (8): RESERVATION_REPOSITORY, ReservationsModule, Module, TODO: Store motif when reservation domain model is updated, ReservationStatus, ReservationMapper, ReservationsInfrastructureModule, Module

### Community 82 - "admin-settings.controller.ts"
Cohesion: 0.11
Nodes (18): ADMIN_ROLES, AdminSettingsController, COMMISSION_KEYS, DEFAULT_SETTINGS, PLATFORM_KEYS, ApiBearerAuth, ApiBody, ApiOperation (+10 more)

### Community 83 - "Public"
Cohesion: 0.21
Nodes (17): Public(), AuthenticationController, ApiBearerAuth, ApiOperation, ApiResponse, ApiTags, Body, Controller (+9 more)

### Community 84 - "PayoutMethodsController"
Cohesion: 0.14
Nodes (16): PayoutMethodsController, ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags, Body, Controller (+8 more)

### Community 85 - "OtpRecordStore"
Cohesion: 0.13
Nodes (10): OtpRecord, OtpRecordStore, readPositiveInt(), build(), makeStore(), Inject, TooManyOtpAttemptsError, CacheOtpRecordStoreAdapter (+2 more)

### Community 86 - "Seed Service Amélioré"
Cohesion: 0.10
Nodes (20): Configuration par défaut, Configuration personnalisée, 📊 Données améliorées, Données financières, Dépannage, Erreurs communes, Extensibilité, Forcer le nettoyage complet (+12 more)

### Community 87 - "AdminEmailTemplatesController"
Cohesion: 0.20
Nodes (13): AdminEmailTemplatesController, ApiBearerAuth, ApiOperation, ApiResponse, ApiTags, Body, Controller, Get (+5 more)

### Community 88 - "TransactionalEmailNotifier"
Cohesion: 0.16
Nodes (10): Inject, Injectable, UserEmailRecipientAdapter, EmailRecipient, EmailRecipientReader, TransactionalEmailModule, Module, TransactionalEmailNotifier (+2 more)

### Community 89 - "MfaMethod"
Cohesion: 0.13
Nodes (8): DELIVERING_CHANNELS, maskEmail(), maskPhone(), MfaMethod, email(), factor(), sms(), totp()

### Community 90 - "UpdatePreferencesDto"
Cohesion: 0.30
Nodes (13): PreferenceBooleanDto, PreferenceLangueDto, SetUserTypeDto, ApiProperty, ApiPropertyOptional, IsBoolean, IsIn, IsOptional (+5 more)

### Community 91 - "SpvEntity"
Cohesion: 0.14
Nodes (10): RegimeFiscal, Spv, SpvEntity, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn (+2 more)

### Community 92 - ".declarerVersement"
Cohesion: 0.18
Nodes (14): AdminProjectFinanceController, ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags, Body, Controller (+6 more)

### Community 93 - "AdminReservationsController"
Cohesion: 0.21
Nodes (13): AdminReservationsController, mapStatus(), ApiBearerAuth, ApiOperation, ApiTags, Body, Controller, Get (+5 more)

### Community 94 - "BroadcastService"
Cohesion: 0.20
Nodes (3): BroadcastChannelToggles, BroadcastService, Injectable

### Community 95 - ".verser"
Cohesion: 0.08
Nodes (22): ApiPropertyOptional, IsNotEmpty, IsOptional, IsPositive, IsString, Max, VerserPorteurStripeDto, AdminVersementPorteurController (+14 more)

### Community 96 - "stripe-identity.service.ts"
Cohesion: 0.17
Nodes (5): KycImageUrls, KycReportData, STRIPE_IDENTITY_SERVICE, StripeIdentityService, VerificationSessionResult

### Community 97 - ".adminCancel"
Cohesion: 0.21
Nodes (14): ReservationController, ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags, Body, Controller (+6 more)

### Community 98 - "scripts"
Cohesion: 0.11
Nodes (19): scripts, build, format, lint, migration:drop, migration:generate, migration:revert, migration:run (+11 more)

### Community 99 - "DeclarerVersementPorteurDto"
Cohesion: 0.16
Nodes (15): DeclarerVersementPorteurDto, ListerEtatsFinanciersDto, ApiProperty, ApiPropertyOptional, IsDateString, IsInt, IsNotEmpty, IsNumber (+7 more)

### Community 100 - "YouSignService"
Cohesion: 0.05
Nodes (27): AppModule, Module, SignatureProviderUnavailableError, DELAI_AVANT_NOUVELLE_TENTATIVE_S, MESSAGE_SIGNATURE_INDISPONIBLE, SignatureProviderExceptionFilter, Catch, Injectable (+19 more)

### Community 101 - "authentication.controller.ts"
Cohesion: 0.13
Nodes (27): EmailVerificationDto, ApiProperty, IsEmail, DisableMfaDto, EnableMfaDto, EnrollMfaDto, MfaChallengeDto, MfaChallengeIssuedDto (+19 more)

### Community 102 - ".generate"
Cohesion: 0.18
Nodes (13): AdminReportsController, EXPORT_ROLES, REPORT_TYPES, ApiBearerAuth, ApiOperation, ApiResponse, ApiTags, Controller (+5 more)

### Community 103 - "AdminRetraitsController"
Cohesion: 0.12
Nodes (15): AdminRetraitsController, STATUTS, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags (+7 more)

### Community 104 - "SocialProfile"
Cohesion: 0.11
Nodes (9): SocialProfile, IssuedOAuthCode, CookieOAuthStateStore, FacebookAuthStrategy, Injectable, GoogleStrategy, Injectable, LinkedinStrategy (+1 more)

### Community 105 - ".testEmail"
Cohesion: 0.13
Nodes (16): NotificationTestController, ApiOperation, ApiResponse, ApiTags, Body, Controller, HttpCode, Inject (+8 more)

### Community 106 - "EmailService"
Cohesion: 0.10
Nodes (5): Inject, Inject, Inject, InjectRepository, EmailService

### Community 107 - "AdminInvestorsController"
Cohesion: 0.14
Nodes (12): AdminInvestorsController, ROLE_ASSIGN_ROLES, ApiBearerAuth, ApiOperation, ApiTags, Body, Controller, Get (+4 more)

### Community 108 - "StripePaymentService"
Cohesion: 0.11
Nodes (11): CreatePaymentIntentParams, PAYMENT_SERVICE, PaymentIntentResult, PaymentService, StripePaymentService, Injectable, ADR-0002, PlateformeBalanceReader (+3 more)

### Community 109 - "ProjectLedgerService"
Cohesion: 0.19
Nodes (9): ProjectLedgerService, Injectable, InjectDataSource, VersementDeclare, AgregatsLedgerProjet, calculerEtatFinancierProjet(), EtatFinancierProjet, etatFinancierSansMouvement() (+1 more)

### Community 110 - "HealthController"
Cohesion: 0.18
Nodes (9): ApiExcludeEndpoint, HealthController, ApiOperation, ApiResponse, ApiTags, Controller, Get, InjectDataSource (+1 more)

### Community 111 - "Checklist de mise en service — BeOwn"
Cohesion: 0.12
Nodes (17): Checklist de mise en service — BeOwn, Feuille de résultats, S0 — Santé technique, S10 — Porteur de projet, S11 — Back-office, S12 — Courriels transactionnels, S13 — Observabilité, S14 — Rollback, répété à blanc (+9 more)

### Community 112 - "Lot 1 — Foundations (KpiCalculator + statuts + migrations) Implementation Plan"
Cohesion: 0.12
Nodes (17): File Structure, Lot 1 Done, Lot 1 — Foundations (KpiCalculator + statuts + migrations) Implementation Plan, Task 10: Add fiscal regime fields to `UserEntity`, Task 11: Migration 1 — `AddFiscalRegimeToUser`, Task 12: Migration 2 — `ExtendEcheanceStatusAndAddChangeTimestamp`, Task 13: Create `KpiModule` skeleton and wire into `AppModule`, Task 14: Run the full test suite (+9 more)

### Community 113 - "FiciDto"
Cohesion: 0.12
Nodes (17): IsDefined, IsObject, FiciDto, SlugParamDto, ApiProperty, ApiPropertyOptional, IsIn, IsInt (+9 more)

### Community 114 - "jest"
Cohesion: 0.10
Nodes (20): jest, collectCoverageFrom, coverageDirectory, maxWorkers, moduleFileExtensions, moduleNameMapper, rootDir, roots (+12 more)

### Community 115 - "round2"
Cohesion: 0.10
Nodes (19): AdminSecondaryMarketController, ApiBearerAuth, ApiOperation, ApiQuery, ApiTags, Controller, Get, HttpCode (+11 more)

### Community 116 - "AdminSortiesController"
Cohesion: 0.12
Nodes (19): DeclareSortieDto, MarkSortieActeeDto, ApiProperty, IsDateString, IsNumber, IsOptional, IsString, IsUUID (+11 more)

### Community 117 - "AuditLogController"
Cohesion: 0.13
Nodes (12): describeAuditAction(), OBJET, SUFFIXES, VERBE, AuditLogController, ApiBearerAuth, ApiOperation, ApiQuery (+4 more)

### Community 118 - "fiscalite.module.ts"
Cohesion: 0.09
Nodes (23): DistributionsInfrastructureModule, Module, FiscaliteModule, Module, IfuCronService, Cron, Inject, Injectable (+15 more)

### Community 119 - "reclamations.controller.ts"
Cohesion: 0.23
Nodes (14): ajouterJoursOuvrables(), CategorieReclamation, DELAI_ACCUSE_RECEPTION_JOURS_OUVRABLES, DELAI_REPONSE_MOIS, echeanceAccuseReception(), echeanceReponse(), EtatDelais, evaluerDelais() (+6 more)

### Community 121 - "Runbook de lancement — BeOwn"
Cohesion: 0.12
Nodes (17): 0. Comment lire ce document, 10. Rollback — vue d'ensemble, 11. Ne jamais faire, 12. État d'avancement — à tenir à jour, 2. Comptes et accès prestataires, 8.1 Enregistrements DNS attendus, 8.2 Émettre et renouveler les certificats, 8.3 En-têtes de sécurité (+9 more)

### Community 122 - "exclude"
Cohesion: 0.13
Nodes (14): database, dist, **/*.fixture.ts, node_modules, **/*spec.ts, src/**/*, test, ./tsconfig.json (+6 more)

### Community 123 - "CreateOrdreMarcheDto"
Cohesion: 0.17
Nodes (16): AcheteurMinimalDto, CreateOrdreMarcheDto, DevisFraisCessionDto, ExprimerInteretDto, InteretRecuDto, ProjetAnnonceDto, ApiProperty, ApiPropertyOptional (+8 more)

### Community 124 - ".closeCollecte"
Cohesion: 0.25
Nodes (11): AdminProjectActionsController, ApiBearerAuth, ApiOperation, ApiResponse, ApiTags, Body, Controller, HttpCode (+3 more)

### Community 125 - "CgpController"
Cohesion: 0.24
Nodes (9): CgpController, ApiBearerAuth, ApiOperation, ApiTags, Controller, Get, Param, Patch (+1 more)

### Community 126 - "manage-payout-methods.usecase.ts"
Cohesion: 0.24
Nodes (6): ConnectAccountReader, ConnectAccountStatus, PayoutMethodsReader, PayoutMethodsWriter, ManagePayoutMethodsUseCase, Injectable

### Community 127 - "ProfilPP"
Cohesion: 0.17
Nodes (5): Inject, Injectable, UpdateProfilPPInput, UpdateProfilPPUseCase, ProfilPP

### Community 128 - "InMemoryPayoutMethodsAdapter"
Cohesion: 0.13
Nodes (6): InstantBalanceView, PayoutMethodView, InMemoryPayoutMethodsAdapter, Injectable, StripePayoutMethodsService, Injectable

### Community 129 - "broadcast.service.ts"
Cohesion: 0.15
Nodes (13): BROADCAST_PREF_DEFAULTS, BroadcastEvent, BroadcastResult, BroadcastStats, CampaignConfig, CAMPAIGNS, Recipient, Deps (+5 more)

### Community 130 - "jwt-token-signer.adapter.ts"
Cohesion: 0.18
Nodes (9): TOKEN_SIGNER, TokenSigner, TokenSignOptions, TokenVerifyOptions, JwtTokenSignerAdapter, Inject, Injectable, TokenSignerModule (+1 more)

### Community 131 - "TemplatedEmailService"
Cohesion: 0.14
Nodes (3): MailpitEmailService, Injectable, TemplatedEmailService

### Community 132 - "Lot 2 — Investor + Project KPIs Implementation Plan"
Cohesion: 0.14
Nodes (14): File Structure, Lot 2 Done, Lot 2 — Investor + Project KPIs Implementation Plan, Task 10: Integration test — cache invalidation on event, Task 11: Manual smoke test against the dev environment, Task 1: Define `InvestorPortfolioKpis` and `ProjectPublicKpis` types, Task 2: TDD — `InvestorKpiService` (computePerInvestment helper), Task 3: Investor controller + `PATCH /me/regime-fiscal` (+6 more)

### Community 133 - "Design — Indicateurs financiers crowdlending obligataire (KPIs BeOwn)"
Cohesion: 0.14
Nodes (14): 10. Structure du module `kpi`, 11. Stratégie de tests, 12. Error handling, 13. Performance & monitoring, 14. Plan de déploiement (3 lots), 16. Hors scope (explicitement), 17. Risques et mitigations, 2. Décisions structurantes (validées en brainstorm) (+6 more)

### Community 134 - "probe-cache-redis.ts"
Cohesion: 0.27
Nodes (10): CacheProbeModule, main(), scanAll(), Module, VALUE, buildCacheModuleOptions(), DEFAULT_REDIS_HOST, DEFAULT_REDIS_PORT (+2 more)

### Community 135 - "InvestisseurDistributionsController"
Cohesion: 0.15
Nodes (10): GetInvestisseurDistributionHistoryUseCase, Inject, Injectable, InvestisseurDistributionsController, ApiBearerAuth, ApiOperation, ApiTags, Controller (+2 more)

### Community 136 - "RedisThrottlerStorage"
Cohesion: 0.18
Nodes (7): Optional, RedisThrottlerStorage, FakeRedis, Injectable, ThrottlerStorageModule, Global, Module

### Community 137 - "CreateBailDto"
Cohesion: 0.18
Nodes (13): CreateBailDto, CreateLocataireInline, ApiProperty, IsDateString, IsEmail, IsNotEmpty, IsNumber, IsOptional (+5 more)

### Community 138 - "ReclamationEntity"
Cohesion: 0.17
Nodes (10): ReclamationsService, Injectable, InjectRepository, ReclamationEntity, Column, CreateDateColumn, Entity, Index (+2 more)

### Community 139 - "dependencies"
Cohesion: 0.06
Nodes (33): bcrypt, @nestjs/cache-manager, @nestjs/jwt, @nestjs/passport, nodemailer, @opentelemetry/api, @opentelemetry/resources, dependencies (+25 more)

### Community 140 - "SeedService"
Cohesion: 0.34
Nodes (3): round2(), SeedService, Injectable

### Community 141 - "Lot 3 — Admin KPIs, Crons & Marketing Implementation Plan"
Cohesion: 0.15
Nodes (13): File Structure, Lot 3 — Admin KPIs, Crons & Marketing Implementation Plan, Lot 3 Done, Task 10: Manual smoke test + 36h-stale validation, Task 1: Define `AdminKpiSnapshotData` type and `KpiSnapshotAdminEntity`, Task 2: Migration 3 — `CreateKpiSnapshotAdmin`, Task 3: TDD — `AdminKpiService.recompute` (compute-from-scratch logic), Task 4: `EcheanceStatusJob` (cron 01:00) (+5 more)

### Community 142 - "ADR — Grand livre interne : crédit du wallet projet et invariant comptable"
Cohesion: 0.17
Nodes (11): ADR — Grand livre interne : crédit du wallet projet et invariant comptable, Conséquences vérifiables, Contexte — le registre n'était pas équilibré, Dette assumée, Décision 1 — L'invariant porte sur `solde + soldeBloque`, pas sur `solde` seul, Décision 2 — Le wallet projet est crédité quand l'engagement devient définitif, Décision 3 — Idempotence du wallet projet par le verrou de la ligne projet, Décision 4 — Aucun flux d'argent réel ; le versement au porteur est déclaratif (+3 more)

### Community 143 - "ADR — Retrait par carte et versement instantané (Stripe Instant Payout)"
Cohesion: 0.17
Nodes (11): ADR — Retrait par carte et versement instantané (Stripe Instant Payout), Alternatives écartées, Constat de sonde (préalable à toute décision), Décision 1 — Coexistence carte instantanée / IBAN standard, sans réécriture, Décision 2 — Aucun cache local des destinations de retrait, Décision 3 — Le 1 % Stripe est absorbé par la plateforme en V1, Décision 4 — La liste des destinations inclut les IBAN, pas seulement les cartes, Décision 5 — Le plafond de 9 999 € ne s'applique qu'au versement instantané (+3 more)

### Community 144 - "Environnement de test local — BeOwn"
Cohesion: 0.20
Nodes (10): Après TOUT insert SQL manuel : réaligner les séquences, Comptes de test (20 comptes, TOUS seedés), Contraintes à respecter pendant les tests, Endpoints utiles (vérifiés), Environnement de test local — BeOwn, Projets seedés (7 — tous les statuts du cycle), Reset complet (destructif — à coordonner), Services (+2 more)

### Community 145 - "Plan de Gestion Extinctive (Run-off) — BeOwn"
Cohesion: 0.17
Nodes (12): 1. Notification (J+0), 2. Gel des nouvelles activités (J+1 à J+7), 3. Transfert vers gestionnaire extinctif (J+7 à J+30), 4. Continuation des remboursements (J+30 → fin de tous les investissements), Contacts d'urgence, Données critiques à sauvegarder, Exports d'urgence (à pouvoir générer en 1h), Objectif (+4 more)

### Community 146 - "AdminComplianceController"
Cohesion: 0.18
Nodes (10): AdminComplianceController, ApiBearerAuth, ApiOperation, ApiTags, Body, Controller, Get, Param (+2 more)

### Community 147 - "SecondaryMarketController"
Cohesion: 0.19
Nodes (8): arrondi2(), AssietteCession, SecondaryMarketController, ApiBearerAuth, ApiTags, Controller, SkipThrottle, UseFilters

### Community 148 - "SignUpDto"
Cohesion: 0.29
Nodes (11): ForgotPasswordDto, ResetPasswordDto, SignUpDto, ApiProperty, ApiPropertyOptional, IsEmail, IsNotEmpty, IsOptional (+3 more)

### Community 149 - "chronologie-status.ts"
Cohesion: 0.20
Nodes (6): computeChronologieStatuts(), ProjectTimelineCronService, Cron, Injectable, InjectRepository, EtapeChronologie

### Community 150 - "ReservationEntity"
Cohesion: 0.18
Nodes (10): ReservationEntity, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn (+2 more)

### Community 151 - "Suivis sécurité & config prod — 2026-07-21"
Cohesion: 0.18
Nodes (10): 1.1 Rotation du mot de passe Gmail (hygiène — NON urgent), 1.2 Abonnement du webhook Stripe Identity, 1.3 Migration Redis / @keyv/redis, 1. Actions de configuration production (EXTERNES — à faire par l'équipe), 2. Suivis sécurité (corrections livrées + reste), 3. Verdict de la vérification d'audit (pour mémoire), 4. État build / repos, Corrigé (branche `fix/security-hardening`, revues APPROVED) (+2 more)

### Community 152 - "logger.config.ts"
Cohesion: 0.40
Nodes (3): IGNORED_PREFIXES, loggerConfig, REDACT_PATHS

### Community 153 - "admin-email-templates.controller.ts"
Cohesion: 0.15
Nodes (14): ADMIN_ROLES, admin, makeController(), makeRow(), SAVED_AT, ApiPropertyOptional, IsBoolean, IsNotEmpty (+6 more)

### Community 154 - "DeclareLoyerDto"
Cohesion: 0.18
Nodes (10): DeclareLoyerDto, ApiProperty, ArrayMinSize, IsArray, IsDateString, IsNumber, IsString, IsUUID (+2 more)

### Community 155 - "UpdateBailDto"
Cohesion: 0.24
Nodes (10): ResilierBailDto, ApiProperty, IsDateString, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString (+2 more)

### Community 157 - "AdminPlatformWalletController"
Cohesion: 0.23
Nodes (7): AdminPlatformWalletController, ApiBearerAuth, ApiOperation, ApiTags, Controller, Get, UseGuards

### Community 158 - "audit.interceptor.ts"
Cohesion: 0.31
Nodes (5): AUDIT_EXCLUDED_RESOURCES, AuditInterceptor, MUTATING, sanitizeBody(), Injectable

### Community 159 - "AdminRetraitsReapController"
Cohesion: 0.18
Nodes (10): AdminRetraitsReapController, ROLES_RETRAITS, ApiBearerAuth, ApiOperation, ApiResponse, ApiTags, Controller, HttpCode (+2 more)

### Community 160 - "UploadDocumentDto"
Cohesion: 0.16
Nodes (13): SetOrdreDto, ApiProperty, ApiPropertyOptional, IsBoolean, IsEnum, IsInt, IsNotEmpty, IsOptional (+5 more)

### Community 161 - "yousign-webhook.controller.spec.ts"
Cohesion: 0.10
Nodes (19): MouvementSeed, PositionMutable, makeChainableQb(), setup(), RapportReconciliation, STATUTS_MOUVEMENT_APPLIQUE, EcartRapprochement, EcritureGrandLivre (+11 more)

### Community 162 - "ADR — Le grand livre n'a que deux colonnes de portefeuille (suppression du doublon `wallet_source`)"
Cohesion: 0.22
Nodes (8): ADR — Le grand livre n'a que deux colonnes de portefeuille (suppression du doublon `wallet_source`), Conséquence sur le schéma — PAS de `migration:run`, Contexte — trois colonnes de portefeuille pour deux rôles, Dette assumée, Décision 1 — Deux colonnes, et deux seulement, Décision 2 — Le sens de chaque écriture est fixé par type, Décision 3 — Le rapprochement devient une primitive du domaine, Rattrapage des données existantes

### Community 163 - "probe-instant-payout.ts"
Cohesion: 0.39
Nodes (8): cleanup(), describeExternalAccount(), fail(), KEEP, main(), SKIP_TRANSFER, stripe, title()

### Community 164 - "EmailTemplateService"
Cohesion: 0.31
Nodes (6): handlebars, handlebars, EmailTemplateService, extractTitle(), Injectable, wrapInLayout()

### Community 165 - "4. Stripe"
Cohesion: 0.25
Nodes (8): 4.1 Faire valider l'activité par Stripe — avant tout le reste, 4.2 Activer le compte plateforme, 4.3 Passer en clés live, 4.4 Déclarer les webhooks, 4.5 Onboarding Stripe Connect, de bout en bout, au moins une fois, 4.6 Cartes de débit externes — état réel, 4.7 Rotation et stockage des clés, 4. Stripe

### Community 166 - "UpdateEcheanceDto"
Cohesion: 0.36
Nodes (8): InitializeScheduleDto, IsDateString, IsEnum, IsNumber, IsOptional, Min, UpdateAggregatedEcheanceDto, UpdateEcheanceDto

### Community 167 - "index.ts"
Cohesion: 0.03
Nodes (55): AccountStatusGuard, expectRejection(), Injectable, InjectRepository, ACCOUNT_CLOSED_CODE, ACCOUNT_CLOSED_MESSAGE, ACCOUNT_DELETION_BLOCKED_CODE, ACCOUNT_SUSPENDED_CODE (+47 more)

### Community 168 - "AdminTransactionsLitigesController"
Cohesion: 0.17
Nodes (9): AdminTransactionsLitigesController, ROLES_LITIGES, ADMIN, ApiBearerAuth, ApiOperation, ApiTags, Controller, Get (+1 more)

### Community 169 - "package.json"
Cohesion: 0.29
Nodes (6): author, description, license, name, private, version

### Community 170 - "CancelReservationUseCase"
Cohesion: 0.33
Nodes (4): CancelReservationUseCase, Inject, Injectable, Inject

### Community 171 - "À la charge du fondateur"
Cohesion: 0.33
Nodes (6): F1 — Comptes prestataires à ouvrir et à activer, F2 — Licence de la police Helvetica Now, F3 — Structure juridique et documents, F4 — Arbitrages en attente, F5 — Points techniques bloquants qui vous appartiennent aussi, À la charge du fondateur

### Community 172 - "3. Variables d'environnement et secrets"
Cohesion: 0.33
Nodes (6): 3.1 Comment la configuration arrive dans l'application, 3.2 Tableau exhaustif de `.env.example`, 3.3 Variables lues par le code mais absentes de `.env.example`, 3.4 Écarts entre le template de secrets et le besoin réel, 3.5 Créer les secrets d'un environnement, 3. Variables d'environnement et secrets

### Community 173 - "CreateTransactionDto"
Cohesion: 0.25
Nodes (11): CreateTransactionDto, CreateWalletDto, ApiProperty, ApiPropertyOptional, IsEnum, IsIn, IsNotEmpty, IsNumber (+3 more)

### Community 174 - "15. Contenu marketing à remplacer"
Cohesion: 0.33
Nodes (6): 15.1 — Localisation, 15.2 — Section cible (remplace les 5 formules immo), 15.3 — Mention de transition (optionnelle, en haut de page), 15.4 — Cohérence terminologique (libellés front ↔ API), 15. Contenu marketing à remplacer, **6. Indicateurs financiers BeOwn**

### Community 175 - "4. Domain — `KpiCalculator` (cœur testable)"
Cohesion: 0.33
Nodes (6): 4.1 — `computeIrr` (Newton-Raphson), 4.2 — `computeWal` (Weighted Average Life), 4.3 — `computeNetInterests` (PFU / barème / dispense), 4.4 — `deriveEcheanceStatus`, 4.5 — Agrégations, 4. Domain — `KpiCalculator` (cœur testable)

### Community 176 - "8. Statuts & crons"
Cohesion: 0.33
Nodes (6): 8.1 — Évolution de `EcheanceStatus`, 8.2 — `EcheanceStatusJob`, 8.3 — `AdminKpiSnapshotJob`, 8.4 — Events émis, 8.5 — Perte définitive (action manuelle admin), 8. Statuts & crons

### Community 177 - "formatEur"
Cohesion: 0.04
Nodes (73): InjectThrottlerOptions, InjectThrottlerStorage, ADMIN_ROLES, CancelCollecteDto, InjectRepository, AML_THRESHOLD_MONTHLY, AML_THRESHOLD_SINGLE, AmlContext (+65 more)

### Community 178 - "nest-cli.json"
Cohesion: 0.33
Nodes (5): collection, compilerOptions, deleteOutDir, $schema, sourceRoot

### Community 179 - "route-permissions.hardening.spec.ts"
Cohesion: 0.29
Nodes (7): PermissionsGuard, Injectable, allows(), contextFor(), ControllerClass, expectForbidden(), guard

### Community 180 - "ConfirmRetractationCronService"
Cohesion: 0.31
Nodes (4): ConfirmRetractationCronService, Cron, Injectable, InjectDataSource

### Community 181 - "InvestisseurFiscaliteController"
Cohesion: 0.20
Nodes (9): InvestisseurFiscaliteController, ApiBearerAuth, ApiOperation, ApiTags, Controller, Get, Param, Res (+1 more)

### Community 183 - "EmailTemplateEntity"
Cohesion: 0.20
Nodes (8): Inject, InjectRepository, InjectRepository, EmailTemplateEntity, Column, Entity, PrimaryColumn, UpdateDateColumn

### Community 184 - "ReconciliationService"
Cohesion: 0.10
Nodes (16): ReconciliationCronService, Cron, Injectable, ReconciliationService, Injectable, AdminReconciliationController, ApiBearerAuth, ApiOperation (+8 more)

### Community 185 - "1. Carte du système"
Cohesion: 0.40
Nodes (5): 1.1 Les trois applications, 1.2 Environnements et branches, 1.3 Ce que le dépôt contient — et ce qu'il ne contient pas, 1.4 Ordre d'exécution recommandé, 1. Carte du système

### Community 186 - "6. Base de données"
Cohesion: 0.40
Nodes (5): 6.1 Le point de blocage à connaître avant tout, 6.2 Créer le schéma en production — état des lieux honnête, 6.3 Sauvegarde de PostgreSQL, 6.4 Restauration — la procédure à répéter avant d'en avoir besoin, 6. Base de données

### Community 187 - "7. CI/CD — Jenkins et déclenchement par GitHub"
Cohesion: 0.40
Nodes (5): 7.1 Ce qui existe, 7.2 Faire déclencher les builds par un `git push`, 7.3 Vérifier le mapping branche → environnement, 7.4 Revenir en arrière sur un déploiement, 7. CI/CD — Jenkins et déclenchement par GitHub

### Community 188 - "README.md"
Cohesion: 0.40
Nodes (4): Compile and run the project, Description, Project setup, Run tests

### Community 189 - "SetPepFlagDto"
Cohesion: 0.40
Nodes (5): SetPepFlagDto, ApiProperty, IsBoolean, IsOptional, IsString

### Community 190 - "PayEcheanceUseCase"
Cohesion: 0.27
Nodes (4): PAYABLE_STATUSES, PayEcheanceUseCase, Injectable, InjectDataSource

### Community 191 - "safe-html.ts"
Cohesion: 0.15
Nodes (21): ArrayMaxSize, ALLOWED_TAGS, analyzeHtml(), decodeEntities(), GLOBAL_ATTRS, IsSafeHtml, isSafeUrl(), SAFE_URL_PREFIXES (+13 more)

### Community 192 - "InitiateInvestmentDto"
Cohesion: 0.40
Nodes (5): InitiateInvestmentDto, ApiProperty, IsInt, IsPositive, IsUUID

### Community 193 - "PlatformFeesService"
Cohesion: 0.10
Nodes (23): AdminSettingsEntity, BroadcastSettings, BroadcastSettingsPatch, DEFAULT_BROADCAST_SETTINGS, Column, Entity, PrimaryColumn, UpdateDateColumn (+15 more)

### Community 194 - "KycEntity"
Cohesion: 0.18
Nodes (10): KycEntity, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn (+2 more)

### Community 210 - "Comment se servir de ce document"
Cohesion: 0.50
Nodes (4): Comment se servir de ce document, Contraintes à respecter pendant les tests, Où jouer cette checklist, Personas utilisés

### Community 212 - "1. Contexte et problème"
Cohesion: 0.50
Nodes (4): 1.1 — Situation actuelle, 1.2 — Objectif du design, 1.3 — Non-objectifs, 1. Contexte et problème

### Community 213 - "6. Application — Project KPI Service (cache 5 min)"
Cohesion: 0.50
Nodes (4): 6.1 — Forme de la réponse, 6.2 — Stratégie de cache, 6.3 — Garde-fous, 6. Application — Project KPI Service (cache 5 min)

### Community 214 - "7. Application — Admin KPI Service (snapshot quotidien)"
Cohesion: 0.50
Nodes (4): 7.1 — Table `kpi_snapshot_admin`, 7.2 — Forme du snapshot, 7.3 — Garde-fous, 7. Application — Admin KPI Service (snapshot quotidien)

### Community 215 - "9. Migrations TypeORM"
Cohesion: 0.50
Nodes (4): 9.1 — `1715000000000-AddFiscalRegimeToUser.ts`, 9.2 — `1715000000001-ExtendEcheanceStatusAndAddChangeTimestamp.ts`, 9.3 — `1715000000002-CreateKpiSnapshotAdmin.ts`, 9. Migrations TypeORM

### Community 216 - "UpdateReservationAdminDto"
Cohesion: 0.50
Nodes (4): IsNumber, IsOptional, Min, UpdateReservationAdminDto

### Community 217 - "MfaMethodEntity"
Cohesion: 0.20
Nodes (9): MfaMethodEntity, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn (+1 more)

### Community 218 - "ADR — Migrations TypeORM retirées du pipeline de déploiement"
Cohesion: 0.29
Nodes (6): ADR — Migrations TypeORM retirées du pipeline de déploiement, Conséquences / dette assumée, Contexte, Décision, Sortie de dette (préalable à tout lancement), Évolutions de schéma en attente de la sortie de dette

### Community 219 - "save-test-connaissances.usecase.ts"
Cohesion: 0.13
Nodes (22): SaveTestConnaissancesUseCase, TestConnaissancesResponse, Injectable, versReponseTestConnaissances(), DUREE_VALIDITE_EVALUATION_MOIS, AVERTISSEMENT_INADEQUATION, DomaineTestConnaissances, evaluerTestConnaissances() (+14 more)

### Community 235 - "ADR — Limitation de débit : fail-open par défaut, fail-closed ciblé"
Cohesion: 0.40
Nodes (4): ADR — Limitation de débit : fail-open par défaut, fail-closed ciblé, Conséquences assumées, Contexte, Décision

### Community 236 - "AddUniteLouableDto"
Cohesion: 0.25
Nodes (7): AddUniteLouableDto, ApiProperty, IsNumber, IsOptional, IsString, IsUUID, Min

### Community 237 - "payout-methods.contract.spec.ts"
Cohesion: 0.29
Nodes (5): Harness, makeFakeStripe(), makeInMemoryHarness(), makeStripeHarness(), stripeError()

### Community 238 - "update-project-status.usecase.spec.ts"
Cohesion: 0.24
Nodes (6): FICI_VALIDE, makeDeps(), makeProject(), Inject, Injectable, UpdateProjectStatusUseCase

### Community 239 - "reservation.controller.ts"
Cohesion: 0.17
Nodes (11): CreateReservationUseCase, Inject, Injectable, CancelReservationDto, CreateReservationDto, ApiProperty, IsNotEmpty, IsNumber (+3 more)

### Community 243 - "DepotCleanupCronService"
Cohesion: 0.33
Nodes (4): DepotCleanupCronService, Cron, Injectable, InjectRepository

### Community 253 - "CreateReclamationDto"
Cohesion: 0.29
Nodes (10): CreateReclamationDto, RepondreReclamationDto, ApiProperty, ApiPropertyOptional, IsEnum, IsOptional, IsString, IsUUID (+2 more)

### Community 263 - "RetraitsReaperService"
Cohesion: 0.31
Nodes (4): RetraitsReaperService, Cron, Injectable, InjectRepository

### Community 267 - "connect-prefill.ts"
Cohesion: 0.57
Nodes (6): buildIndividualPrefill(), clean(), cleanCountry(), cleanDob(), cleanPhone(), IndividualPrefill

### Community 273 - "ContactDto"
Cohesion: 0.33
Nodes (6): ContactDto, IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength

### Community 277 - "RecaptchaService"
Cohesion: 0.33
Nodes (3): RecaptchaResponse, RecaptchaService, Injectable

### Community 281 - "seed.ts"
Cohesion: 0.50
Nodes (4): bootstrap(), SeedModule, Module, runMigrations()

### Community 282 - "CalculateDistributionDto"
Cohesion: 0.40
Nodes (4): CalculateDistributionDto, ApiProperty, IsUUID, Matches

### Community 286 - "5. Courriel et SMS"
Cohesion: 0.50
Nodes (4): 5.1 Choisir le transport, 5.2 Configurer le SMTP, 5.3 SMS, 5. Courriel et SMS

### Community 309 - "redirect-url.ts"
Cohesion: 0.57
Nodes (5): estRedirectionAutorisee(), normaliserOrigine(), resoudreUrlRedirection(), SCHEMAS_AUTORISES, ALLOWLIST

### Community 312 - "UpdateUserStatusDto"
Cohesion: 0.29
Nodes (7): ApiProperty, ApiPropertyOptional, IsEnum, IsOptional, IsString, MaxLength, UpdateUserStatusDto

### Community 313 - ".constructor"
Cohesion: 0.08
Nodes (22): CreateProjectUseCase, Inject, Injectable, Inject, Injectable, UpdateProjectUseCase, arrondir(), debutFenetreGlissante() (+14 more)

### Community 314 - "payment.controller.apport-porteur.spec.ts"
Cohesion: 0.40
Nodes (3): AUTRE_PORTEUR, DTO, PORTEUR

### Community 316 - "SignInDto"
Cohesion: 0.33
Nodes (5): SignInDto, ApiProperty, IsEmail, IsNotEmpty, MinLength

## Knowledge Gaps
- **670 isolated node(s):** `ParametresFici`, `ActualiteSeed`, `PositionMutable`, `SEED_ENTITIES`, `SeedConfig` (+665 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **106 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ActiveUser` connect `ActiveUser` to `UserEntity`, `ProjectEntity`, `porteur.controller.ts`, `TransactionEntity`, `InvestisseurDistributionsController`, `seed.service.improved.ts`, `WalletController`, `avis.controller.ts`, `ProjectStatus`, `AdminComplianceController`, `ReclamationsController`, `SecondaryMarketController`, `projects.module.ts`, `admin-email-templates.controller.ts`, `calculate-distribution-periode.usecase.ts`, `ProfilPMEntity`, `AdminPlatformWalletController`, `profile.controller.ts`, `AdminRetraitsReapController`, `ProjectController`, `StatutDeclaration`, `secondary-market.controller.ts`, `PaymentController`, `index.ts`, `AdminTransactionsLitigesController`, `AdminController`, `ProfileController`, `RequirePermission`, `CurrentUser`, `InvestmentController`, `formatEur`, `.exprimerInteret`, `.push`, `PorteurController`, `InvestisseurFiscaliteController`, `AdminLocativeController`, `ReconciliationService`, `AdminNewsController`, `kyc-validated.guard.ts`, `PayEcheanceUseCase`, `AdminExportsController`, `GetPorteurTresorerieUseCase`, `AdminDistributionsController`, `NotificationController`, `IfuGenerationService`, `admin-settings.controller.ts`, `Public`, `PayoutMethodsController`, `AdminEmailTemplatesController`, `.declarerVersement`, `AdminReservationsController`, `.verser`, `.adminCancel`, `authentication.controller.ts`, `.generate`, `AdminRetraitsController`, `AdminInvestorsController`, `reservation.controller.ts`, `round2`, `fiscalite.module.ts`, `reclamations.controller.ts`, `.closeCollecte`, `CgpController`?**
  _High betweenness centrality (0.098) - this node is a cross-community bridge._
- **Why does `CurrentUser` connect `CurrentUser` to `UserEntity`, `ProjectEntity`, `porteur.controller.ts`, `TransactionEntity`, `InvestisseurDistributionsController`, `seed.service.improved.ts`, `WalletController`, `avis.controller.ts`, `ProjectStatus`, `AdminComplianceController`, `ReclamationsController`, `SecondaryMarketController`, `projects.module.ts`, `admin-email-templates.controller.ts`, `calculate-distribution-periode.usecase.ts`, `ActiveUser`, `ProfilPMEntity`, `AdminPlatformWalletController`, `profile.controller.ts`, `AdminRetraitsReapController`, `ProjectController`, `StatutDeclaration`, `secondary-market.controller.ts`, `PaymentController`, `AdminTransactionsLitigesController`, `AdminController`, `ProfileController`, `RequirePermission`, `InvestmentController`, `formatEur`, `.exprimerInteret`, `PorteurController`, `InvestisseurFiscaliteController`, `AdminLocativeController`, `ReconciliationService`, `AdminNewsController`, `kyc-validated.guard.ts`, `AdminExportsController`, `GetPorteurTresorerieUseCase`, `AdminDistributionsController`, `NotificationController`, `IfuGenerationService`, `admin-settings.controller.ts`, `Public`, `PayoutMethodsController`, `AdminEmailTemplatesController`, `.declarerVersement`, `AdminReservationsController`, `.verser`, `.adminCancel`, `authentication.controller.ts`, `.generate`, `AdminRetraitsController`, `AdminInvestorsController`, `reservation.controller.ts`, `round2`, `fiscalite.module.ts`, `reclamations.controller.ts`, `.closeCollecte`, `CgpController`?**
  _High betweenness centrality (0.079) - this node is a cross-community bridge._
- **Why does `dependencies` connect `dependencies` to `@nestjs/platform-express`, `@nestjs/platform-socket.io`, `@nestjs/schedule`, `@nestjs/terminus`, `@nestjs/throttler`, `@nestjs/typeorm`, `@nestjs/websockets`, `@opentelemetry/auto-instrumentations-node`, `@opentelemetry/exporter-trace-otlp-http`, `@opentelemetry/sdk-node`, `@opentelemetry/semantic-conventions`, `otplib`, `passport`, `passport-facebook`, `pdfkit`, `pg`, `pino`, `prom-client`, `qrcode`, `socket.io`, `swagger-ui-express`, `@types/pdfkit`, `EmailTemplateService`, `package.json`, `@nestjs/event-emitter`, `class-validator`, `@nestjs/mapped-types`, `@nestjs/swagger`, `cache-manager`, `class-transformer`, `cloudinary`, `helmet`, `ioredis`, `@keyv/redis`, `@nestjs/common`, `@nestjs/config`, `@nestjs/core`, `@nestjs/cqrs`, `@getbrevo/brevo`, `nestjs-pino`?**
  _High betweenness centrality (0.076) - this node is a cross-community bridge._
- **What connects `ParametresFici`, `ActualiteSeed`, `PositionMutable` to the rest of the system?**
  _670 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `authentication.module.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.026465758717280016 - nodes in this community are weakly interconnected._
- **Should `UserRepository` be split into smaller, more focused modules?**
  _Cohesion score 0.03201024327784891 - nodes in this community are weakly interconnected._
- **Should `UserEntity` be split into smaller, more focused modules?**
  _Cohesion score 0.04832104832104832 - nodes in this community are weakly interconnected._