# Graph Report - BeOwn-Backside  (2026-09-01)

## Corpus Check
- 767 files · ~420,454 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 6087 nodes · 16931 edges · 325 communities (219 shown, 106 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 13 edges (avg confidence: 0.66)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b73e18f6`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- authentication.module.ts
- authentication.controller.ts
- UserEntity
- InvestmentEntity
- MfaMethodType
- TransactionEntity
- index.ts
- sign-in.usecase.spec.ts
- user.controller.ts
- NotificationEventService
- formatEur
- ProfilPPEntity
- app.module.ts
- fici.ts
- wallet.controller.ts
- investor-kpi.service.ts
- avis.controller.ts
- ProjectStatus
- reclamations.controller.ts
- oauth-redirect-cookie.ts
- .constructor
- Bail
- DeleteAccountUseCase
- StatutDeclaration
- admin-sorties.controller.ts
- calculate-distribution-periode.usecase.ts
- profiles.module.ts
- hasPermission
- porteur.controller.ts
- payout-methods.port.ts
- yousign-webhook.controller.ts
- ProjectController
- User
- locative-management.module.ts
- .constructor
- email-driver.provider.ts
- investment.controller.ts
- PaymentController
- contact.controller.ts
- investor-classification.ts
- Document
- DistributionPart
- RequirePermission
- SeedService
- ProfileController
- email-template.service.ts
- AdminEcheancesController
- ActiveUser
- InvestmentController
- fiscalite.module.ts
- SecondaryMarketController
- RequestRetraitUseCase
- CurrentUser
- AdminLocativeController
- sms.module.ts
- InvestmentRepository
- connect-prefill.ts
- .upload
- payout-destination.resolver.ts
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
- ProjectEntity
- Reservation
- taux-defaut-publication.ts
- notification-unsubscribe.service.spec.ts
- CreateApportPorteurDto
- update-admin-settings.dto.ts
- stripe-identity-kyc-document.adapter.ts
- profile.controller.ts
- compilerOptions
- IfuGenerationService
- reservation.controller.ts
- AdminSettingsController
- ApiOperation
- .detach
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
- StripeIdentityServiceImpl
- .adminCancel
- scripts
- DeclarerVersementPorteurDto
- main.ts
- mfa.dto.ts
- .generate
- AdminRetraitsController
- Public
- notification-test.controller.ts
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
- AdminSettingsEntity
- AuditLogController
- AdminFiscaliteController
- NotificationGateway
- .handleStripeWebhook
- Runbook de lancement — BeOwn
- exclude
- CreateOrdreMarcheDto
- .closeCollecte
- CgpController
- manage-payout-methods.usecase.ts
- .pushToAdmins
- StripePayoutMethodsService
- broadcast.service.ts
- ConflitsInteretsService
- TemplatedEmailService
- Lot 2 — Investor + Project KPIs Implementation Plan
- Design — Indicateurs financiers crowdlending obligataire (KPIs BeOwn)
- probe-cache-redis.ts
- InvestisseurDistributionsController
- RedisThrottlerStorage
- CreateBailDto
- DeclareChargeDto
- dependencies
- SeedService
- Lot 3 — Admin KPIs, Crons & Marketing Implementation Plan
- ADR — Grand livre interne : crédit du wallet projet et invariant comptable
- ADR — Retrait par carte et versement instantané (Stripe Instant Payout)
- Environnement de test local — BeOwn
- Plan de Gestion Extinctive (Run-off) — BeOwn
- AdminComplianceController
- CreateInvestmentDto
- SignUpDto
- project-timeline-cron.service.ts
- ReservationEntity
- Suivis sécurité & config prod — 2026-07-21
- logger.config.ts
- admin-email-templates.controller.ts
- DeclareLoyerDto
- UpdateBailDto
- test-endpoints.policy.ts
- AdminPlatformWalletController
- audit.interceptor.ts
- RetraitsReaperService
- ProjectRepository
- reconciliation.service.ts
- ADR — Le grand livre n'a que deux colonnes de portefeuille (suppression du doublon `wallet_source`)
- probe-instant-payout.ts
- InMemoryPayoutMethodsAdapter
- 4. Stripe
- UpdateEcheanceDto
- iam-error.filter.spec.ts
- AdminTransactionsLitigesController
- package.json
- CreateReservationUseCase
- À la charge du fondateur
- 3. Variables d'environnement et secrets
- 9. Observabilité et alertes
- 15. Contenu marketing à remplacer
- 4. Domain — `KpiCalculator` (cœur testable)
- 8. Statuts & crons
- MetricsPort
- nest-cli.json
- route-permissions.hardening.spec.ts
- ConfirmRetractationCronService
- InvestisseurFiscaliteController
- ExchangeCodeDto
- YouSignService
- ReconciliationService
- 1. Carte du système
- 6. Base de données
- 7. CI/CD — Jenkins et déclenchement par GitHub
- README.md
- SetPepFlagDto
- PayoutMethodsController
- news.controller.ts
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
- .getRates
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
- CreateReservationDto
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
- @nestjs/jwt
- @getbrevo/brevo
- nestjs-pino
- @nestjs/platform-express
- @nestjs/platform-socket.io
- @nestjs/schedule
- @nestjs/terminus
- @nestjs/throttler
- @nestjs/typeorm
- @nestjs/websockets
- nodemailer
- @opentelemetry/api
- @opentelemetry/auto-instrumentations-node
- @opentelemetry/exporter-trace-otlp-http
- @opentelemetry/resources
- @opentelemetry/sdk-node
- @opentelemetry/semantic-conventions
- otplib
- passport
- passport-facebook
- passport-google-oauth20
- pdfkit
- pg
- pino
- pino-http
- prom-client
- qrcode
- reflect-metadata
- rxjs
- @sentry/node
- socket.io
- stripe
- swagger-ui-express
- twilio
- typeorm
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
- @types/qrcode
- @types/twilio
- typescript
- typescript-eslint
- assign-project-porteur.js
- set-user-role.js
- verify-test-user.js
- data-source.ts
- redirect-url.ts
- PlateformeBalanceReader
- UpdateUserStatusDto
- CreateProjectUseCase
- payment.controller.apport-porteur.spec.ts
- ProjectViewEntity
- SignInDto
- class-validator
- emailVerifiedPage
- @nestjs/passport
- GetInvestisseurDistributionHistoryUseCase
- RolesGuard
- .constructor
- EmailVerificationDto
- project-read-model.service.spec.ts

## God Nodes (most connected - your core abstractions)
1. `ActiveUser` - 281 edges
2. `CurrentUser` - 240 edges
3. `UserEntity` - 156 edges
4. `ProjectEntity` - 119 edges
5. `InvestmentEntity` - 108 edges
6. `RequirePermission()` - 104 edges
7. `formatEur()` - 99 edges
8. `TransactionEntity` - 99 edges
9. `MetricsPort` - 96 edges
10. `WalletEntity` - 93 edges

## Surprising Connections (you probably didn't know these)
- `UserData` --references--> `UserRole`  [EXTRACTED]
  database/seeds/seed.service.improved.ts → src/iam/domains/enums/user.enum.ts
- `SeedService` --references--> `UserEntity`  [EXTRACTED]
  database/seeds/seed.service.improved.ts → src/iam/infrastructure/persistence/entities/user.entity.ts
- `SeedService` --references--> `InvestmentEntity`  [EXTRACTED]
  database/seeds/seed.service.improved.ts → src/investments/infrastructure/persistences/entities/investment.entity.ts
- `SeedService` --references--> `ProjectEntity`  [EXTRACTED]
  database/seeds/seed.service.improved.ts → src/projects/infrastructure/persistences/entities/project.entity.ts
- `SeedService` --references--> `SpvEntity`  [EXTRACTED]
  database/seeds/seed.service.improved.ts → src/projects/infrastructure/persistences/entities/spv.entity.ts

## Import Cycles
- None detected.

## Communities (325 total, 106 thin omitted)

### Community 0 - "authentication.module.ts"
Cohesion: 0.03
Nodes (59): AuthenticationModule, Module, OTP_RECORD_STORE, SECRET_CIPHER, SecretCipher, TOTP_GENERATOR, TotpGenerator, TotpUriParams (+51 more)

### Community 1 - "authentication.controller.ts"
Cohesion: 0.03
Nodes (65): RecaptchaResponse, RecaptchaService, Injectable, Inject, AuthSession, AuthTokens, EmailTokenPayload, EmailTokenPurpose (+57 more)

### Community 2 - "UserEntity"
Cohesion: 0.06
Nodes (50): UserData, ADMIN_ROLES, MONTH_LABELS, ADMIN_ROLES, ADMIN_ROLES, ADMIN_ROLES, CancelCollecteDto, ADMIN_ROLES (+42 more)

### Community 3 - "InvestmentEntity"
Cohesion: 0.05
Nodes (55): OneToMany, ADMIN_ROLES, MANAGE_ROLES, InjectRepository, InjectRepository, GetAggregatedScheduleUseCase, round2(), Injectable (+47 more)

### Community 4 - "MfaMethodType"
Cohesion: 0.04
Nodes (40): ChannelEnrollmentStrategy, enrollmentOtpKey(), EmailEnrollmentStrategy, Injectable, RFC-6238, MFA_ENROLLMENT_STRATEGIES, MfaEnrollmentChallenge, MfaEnrollmentConfirmation (+32 more)

### Community 5 - "TransactionEntity"
Cohesion: 0.05
Nodes (68): SeedConfig, ADMIN_ROLES, PLATFORM_FEE_SOURCES, CANONICAL_SOURCES, VersementPaye, BLOCKING_INVESTMENT_STATUSES, DeletionBlocker, DeletionInitiator (+60 more)

### Community 6 - "index.ts"
Cohesion: 0.07
Nodes (36): MFA_CHALLENGE_MAX_ATTEMPTS, MfaChallenge, MfaChallengeDraft, MfaChallengePurpose, key(), MFAChallengeCacheService, build(), draft (+28 more)

### Community 7 - "sign-in.usecase.spec.ts"
Cohesion: 0.05
Nodes (32): RFC-5321, RFC-5322, EventsHandler, build(), event, UserRegisteredEventHandler, makeUserRepository(), buildUser() (+24 more)

### Community 8 - "user.controller.ts"
Cohesion: 0.12
Nodes (12): BcryptService, Injectable, HASHING_SERVICE, HashingService, CreateUserProps, Inject, DeleteAccountDto, MANAGE_ROLES (+4 more)

### Community 9 - "NotificationEventService"
Cohesion: 0.14
Nodes (6): ApiBody, Body, Patch, Cron, NotificationEventService, Injectable

### Community 10 - "formatEur"
Cohesion: 0.09
Nodes (24): ADMIN_ROLES, CreateReservationAdminDto, TODO: branch on real e-signature provider (Yousign / DocuSign / Universign)., INVESTMENT_REPOSITORY, ContractGeneratorService, ContratRachatData, Injectable, CreateInvestmentUseCase (+16 more)

### Community 11 - "ProfilPPEntity"
Cohesion: 0.07
Nodes (28): RiskScoringService, Cron, Injectable, InjectRepository, InjectRepository, InjectRepository, ProfilPPEntity, Column (+20 more)

### Community 12 - "app.module.ts"
Cohesion: 0.07
Nodes (52): AdminModule, Module, CgpModule, Module, AmlModule, Module, Module, YouSignModule (+44 more)

### Community 13 - "fici.ts"
Cohesion: 0.09
Nodes (34): contenuComplet, VueDocumentCles, EnregistrerDocumentClesInput, EnregistrerDocumentClesResult, EnregistrerDocumentClesUseCase, Injectable, AIDE_SECTIONS, AVERTISSEMENT_ABSENCE_GARANTIE (+26 more)

### Community 14 - "wallet.controller.ts"
Cohesion: 0.07
Nodes (30): WALLET_REPOSITORY, WalletRepository, Transaction, Wallet, WalletMapper, Injectable, WalletTypeOrmRepository, CreateTransactionDto (+22 more)

### Community 15 - "investor-kpi.service.ts"
Cohesion: 0.06
Nodes (40): RegimeFiscal, InvestorKpiService, Injectable, KpiCache, ProjectKpiService, Inject, Injectable, InjectRepository (+32 more)

### Community 16 - "avis.controller.ts"
Cohesion: 0.05
Nodes (43): Check, AvisModule, Module, AVIS_REPOSITORY, AvisRepository, Avis, AvisInfrastructureModule, Module (+35 more)

### Community 17 - "ProjectStatus"
Cohesion: 0.15
Nodes (22): ProjectData, PROJECT_REPOSITORY, InMemoryProjectRepository, ALLOWED_TRANSITIONS, Injectable, UpdateProjectDto, UpdateProjectUseCase, ModeleEconomique (+14 more)

### Community 18 - "reclamations.controller.ts"
Cohesion: 0.06
Nodes (48): ReclamationsService, Injectable, InjectRepository, ajouterJoursOuvrables(), CategorieReclamation, DELAI_ACCUSE_RECEPTION_JOURS_OUVRABLES, DELAI_REPONSE_MOIS, echeanceAccuseReception() (+40 more)

### Community 19 - "oauth-redirect-cookie.ts"
Cohesion: 0.06
Nodes (25): SocialProfile, Social, CookieOAuthStateStore, FacebookAuthStrategy, Injectable, GoogleStrategy, Injectable, LinkedinStrategy (+17 more)

### Community 20 - ".constructor"
Cohesion: 0.10
Nodes (12): CreateProfilPPUseCase, Inject, Injectable, InjectRepository, GetProfilPPUseCase, Inject, Injectable, Inject (+4 more)

### Community 21 - "Bail"
Cohesion: 0.08
Nodes (26): BAIL_REPOSITORY, BailRepository, CreateBailInput, CreateBailUseCase, Inject, Injectable, ResilierBailUseCase, Inject (+18 more)

### Community 22 - "DeleteAccountUseCase"
Cohesion: 0.43
Nodes (3): DeleteAccountUseCase, isUniqueViolation(), Injectable

### Community 23 - "StatutDeclaration"
Cohesion: 0.09
Nodes (23): CHARGE_REPOSITORY, ChargeRepository, DeclareChargeInput, DeclareChargeUseCase, Inject, Injectable, Inject, Injectable (+15 more)

### Community 24 - "admin-sorties.controller.ts"
Cohesion: 0.06
Nodes (44): SORTIE_PROJET_REPOSITORY, SortieProjetRepository, DeclareSortieInput, DeclareSortieUseCase, round2(), Inject, Injectable, ExecuteSortieResult (+36 more)

### Community 25 - "calculate-distribution-periode.usecase.ts"
Cohesion: 0.10
Nodes (22): PERIODE_DISTRIBUTION_REPOSITORY, PeriodeDistributionRepository, CalculateDistributionPeriodeUseCase, Inject, Injectable, ExecuteDistributionResult, Inject, Injectable (+14 more)

### Community 26 - "profiles.module.ts"
Cohesion: 0.06
Nodes (42): BeneficiaireEffectifEntity, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn (+34 more)

### Community 27 - "hasPermission"
Cohesion: 0.13
Nodes (21): Redirect, hasPermission(), DocumentController, ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiParam (+13 more)

### Community 28 - "porteur.controller.ts"
Cohesion: 0.09
Nodes (23): UNITE_LOUABLE_REPOSITORY, UniteLouableRepository, AddUniteLouableInput, AddUniteLouableUseCase, Inject, Injectable, GetProjectOccupationUseCase, ProjectOccupation (+15 more)

### Community 29 - "payout-methods.port.ts"
Cohesion: 0.23
Nodes (8): ADR-0003, PayoutMethodError, PayoutMethodErrorCode, PayoutMethodType, ADR-0002, HTTP_STATUS_BY_CODE, PayoutMethodExceptionFilter, Catch

### Community 30 - "yousign-webhook.controller.ts"
Cohesion: 0.03
Nodes (93): SEED_ENTITIES, estIndisponibiliteFournisseur(), motifIndisponibilite, SIGNATURE_PROVIDER_UNAVAILABLE, SignatureProviderUnavailableError, DELAI_AVANT_NOUVELLE_TENTATIVE_S, MESSAGE_SIGNATURE_INDISPONIBLE, SignatureProviderExceptionFilter (+85 more)

### Community 31 - "ProjectController"
Cohesion: 0.12
Nodes (23): ProjectReadModelService, Inject, Injectable, GetProjectsUseCase, Injectable, ProjectController, ApiBearerAuth, ApiBody (+15 more)

### Community 32 - "User"
Cohesion: 0.03
Nodes (28): asUniqueViolation(), isEmailUniqueViolation(), POSTGRES_UNIQUE_VIOLATION, readCode(), UniqueViolation, RegisterInput, RegisterUseCase, Inject (+20 more)

### Community 33 - "locative-management.module.ts"
Cohesion: 0.07
Nodes (27): LocativeManagementModule, Module, LOYER_ENCAISSE_REPOSITORY, LoyerEncaisseRepository, DeclareLoyerEncaisseUseCase, DeclareLoyerInput, Inject, Injectable (+19 more)

### Community 34 - ".constructor"
Cohesion: 0.13
Nodes (10): DistributionsCronService, Cron, Inject, Injectable, ExecuteDistributionUseCase, round2(), Inject, Injectable (+2 more)

### Community 35 - "email-driver.provider.ts"
Cohesion: 0.12
Nodes (13): PlatformSettingsModule, Global, Module, PlatformSettingsService, Injectable, BrevoEmailService, Injectable, MAIL_DRIVERS (+5 more)

### Community 36 - "investment.controller.ts"
Cohesion: 0.12
Nodes (24): CancelInvestmentUseCase, Injectable, InjectDataSource, InitiateInvestmentUseCase, Injectable, calculerEcheanceRetractation(), CODE_RETRACTATION_DEJA_EFFECTUEE, CODE_RETRACTATION_DELAI_EXPIRE (+16 more)

### Community 37 - "PaymentController"
Cohesion: 0.13
Nodes (14): PaymentController, ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags, Body, Controller (+6 more)

### Community 38 - "contact.controller.ts"
Cohesion: 0.09
Nodes (19): ContactController, ContactDto, escapeHtml(), ApiOperation, ApiResponse, ApiTags, Body, Controller (+11 more)

### Community 39 - "investor-classification.ts"
Cohesion: 0.11
Nodes (25): SaveQuestionnaireUseCase, Injectable, arrondir(), BasePatrimoniale, calculerExpirationEvaluation(), calculerSeuilAvertissement(), CriteresAvertiPersonneMorale, CriteresAvertiPersonnePhysique (+17 more)

### Community 40 - "Document"
Cohesion: 0.07
Nodes (27): DOCUMENT_REPOSITORY, DocumentRepository, Document, DocumentRelatedTo, DocumentType, DocumentTypeOrmRepository, Injectable, InjectRepository (+19 more)

### Community 41 - "DistributionPart"
Cohesion: 0.08
Nodes (19): DISTRIBUTION_PART_REPOSITORY, DistributionPartRepository, CalculateDistributionResult, InvestisseurDistributionPart, InvestisseurDistributionSummary, DistributionPart, DistributionsInfrastructureModule, Module (+11 more)

### Community 42 - "RequirePermission"
Cohesion: 0.16
Nodes (17): ACTIVE_INVESTMENT_STATUSES, AdminController, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags (+9 more)

### Community 44 - "ProfileController"
Cohesion: 0.13
Nodes (19): GetKycUseCase, Inject, Injectable, KYC_REVIEWER_ROLES, ProfileController, ApiBearerAuth, ApiBody, ApiOperation (+11 more)

### Community 45 - "email-template.service.ts"
Cohesion: 0.07
Nodes (32): handlebars, handlebars, Inject, InjectRepository, DEFAULT_TEMPLATE_META, EmailTemplateService, extractCorps(), extractTitle() (+24 more)

### Community 46 - "AdminEcheancesController"
Cohesion: 0.16
Nodes (19): AdminEcheancesController, AdminEcheancesItemController, PAY_ROLES, ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags (+11 more)

### Community 47 - "ActiveUser"
Cohesion: 0.17
Nodes (17): ActiveUser, ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags, Body, Controller (+9 more)

### Community 48 - "InvestmentController"
Cohesion: 0.16
Nodes (19): Roles(), InvestmentController, ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags, Body (+11 more)

### Community 49 - "fiscalite.module.ts"
Cohesion: 0.07
Nodes (29): FiscaliteModule, Module, IfuCronService, Inject, Injectable, IfuPdfService, InvestorInfo, Injectable (+21 more)

### Community 50 - "SecondaryMarketController"
Cohesion: 0.18
Nodes (16): SecondaryMarketController, ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags, Body, Controller (+8 more)

### Community 51 - "RequestRetraitUseCase"
Cohesion: 0.17
Nodes (5): RequestRetraitUseCase, Injectable, Injectable, VerserPorteurUseCase, CreateRetraitDto

### Community 52 - "CurrentUser"
Cohesion: 0.16
Nodes (14): CurrentUser, PorteurController, ApiBearerAuth, ApiOperation, ApiTags, Body, Controller, Get (+6 more)

### Community 53 - "AdminLocativeController"
Cohesion: 0.14
Nodes (15): RejectDeclarationDto, ApiProperty, IsNotEmpty, IsString, AdminLocativeController, ApiBearerAuth, ApiOperation, ApiTags (+7 more)

### Community 54 - "sms.module.ts"
Cohesion: 0.12
Nodes (13): LogSmsService, Injectable, hasTwilioCredentials(), resolveSmsDriver(), SmsDriver, SmsModule, smsServiceFactory(), TWILIO_ENV (+5 more)

### Community 55 - "InvestmentRepository"
Cohesion: 0.08
Nodes (9): InvestmentRepository, ContractData, TopUpInvestmentUseCase, Inject, Injectable, InjectDataSource, Investment, InvestmentTypeOrmRepository (+1 more)

### Community 56 - "connect-prefill.ts"
Cohesion: 0.16
Nodes (11): InvestorIdentity, InvestorIdentityReader, buildIndividualPrefill(), clean(), cleanCountry(), cleanDob(), cleanPhone(), IndividualPrefill (+3 more)

### Community 57 - ".upload"
Cohesion: 0.13
Nodes (15): slugify(), ApiBody, ApiConsumes, ApiOperation, ApiQuery, ApiResponse, Body, Delete (+7 more)

### Community 58 - "payout-destination.resolver.ts"
Cohesion: 0.23
Nodes (10): PayoutMethodKind, PayoutMethodsReader, PayoutDestinationResolver, ResolvedPayoutDestination, ResolvePayoutDestinationInput, Injectable, INSTANT_PAYOUT_MAX_EUR, INSTANT_PAYOUT_MIN_EUR (+2 more)

### Community 59 - "locative-management-infrastructure.module.ts"
Cohesion: 0.13
Nodes (16): LOCATAIRE_REPOSITORY, LocataireRepository, Locataire, LocativeManagementInfrastructureModule, Module, LocataireEntity, Column, CreateDateColumn (+8 more)

### Community 60 - "kyc-validated.guard.ts"
Cohesion: 0.23
Nodes (8): KYC_NOT_VALIDATED_CODE, KYC_NOT_VALIDATED_MESSAGE, kycNotValidatedException(), KycValidatedGuard, ctx(), expectKycRejection(), Injectable, InjectRepository

### Community 61 - "devDependencies"
Cohesion: 0.07
Nodes (27): eslint, eslint-config-prettier, @eslint/eslintrc, @eslint/js, eslint-plugin-prettier, @nestjs/cli, @nestjs/schematics, @nestjs/testing (+19 more)

### Community 62 - "PrometheusMetricsAdapter"
Cohesion: 0.08
Nodes (16): Header, HttpMetricsInterceptor, Injectable, MetricName, MetricsController, ApiExcludeController, Controller, Get (+8 more)

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
Nodes (28): Cron, arrondi2(), BaseCalculFraisCession, calculerAssietteCession(), CODE_ANNONCE_EXPIREE, CODE_DETENTION_TROP_RECENTE, CODE_PROJET_NON_ELIGIBLE, dateCessibiliteMinimale() (+20 more)

### Community 67 - "CLAUDE.md"
Cohesion: 0.08
Nodes (25): 10. Conventions de nommage, 11. Stratégie de tests (alignée sur les couches), 12. ❌ Interdictions strictes, 13. ✅ Checklist avant de générer du code, 14. Exemple de flux complet — "Créer une commande", 15. Commandes utiles (exemple générique — à adapter au `package.json` réel), 16. Pour aller plus loin, 1. La règle d'or : direction des dépendances (+17 more)

### Community 68 - "AdminDistributionsController"
Cohesion: 0.14
Nodes (14): CalculateDistributionDto, ApiProperty, IsUUID, Matches, AdminDistributionsController, ApiBearerAuth, ApiOperation, ApiTags (+6 more)

### Community 69 - "NotificationController"
Cohesion: 0.15
Nodes (13): NotificationController, ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags, Controller, Delete (+5 more)

### Community 70 - "CreateProjectDto"
Cohesion: 0.13
Nodes (25): IsLatitude, IsLongitude, IsUrl, CreateProjectDto, CreateSpvDto, EtapeChronologieDto, GarantieDto, toNumber() (+17 more)

### Community 71 - "ProjectEntity"
Cohesion: 0.05
Nodes (33): InjectRepository, InjectRepository, InjectRepository, InjectRepository, InjectRepository, InjectRepository, InjectRepository, InvestorInactivityCronService (+25 more)

### Community 72 - "Reservation"
Cohesion: 0.13
Nodes (6): ReservationRepository, Inject, Reservation, ReservationMapper, ReservationTypeOrmRepository, Injectable

### Community 73 - "taux-defaut-publication.ts"
Cohesion: 0.12
Nodes (18): agreger(), arrondir(), CohorteAnnuelle, construirePublication(), debutPeriodePublication(), METHODOLOGIE_TAUX_DEFAUT, pourcent(), PROFONDEUR_PUBLICATION_MOIS (+10 more)

### Community 74 - "notification-unsubscribe.service.spec.ts"
Cohesion: 0.07
Nodes (27): NotificationUnsubscribeService, buildSignerConfig(), buildTokenService(), buildTtlConfig(), Injectable, PublicUnsubscribeController, ApiOperation, ApiProperty (+19 more)

### Community 75 - "CreateApportPorteurDto"
Cohesion: 0.20
Nodes (19): AttachPayoutMethodDto, ConfirmDepotDto, ConnectOnboardingDto, CreateApportPorteurDto, CreatePaymentIntentDto, StartKycVerificationDto, ApiProperty, ApiPropertyOptional (+11 more)

### Community 76 - "update-admin-settings.dto.ts"
Cohesion: 0.18
Nodes (20): BroadcastChannelTogglesDto, BroadcastSettingsDto, CommissionsSettingsDto, FeatureFlagsSettingsDto, NotificationsSettingsDto, PlatformSettingsDto, ApiPropertyOptional, IsBoolean (+12 more)

### Community 77 - "stripe-identity-kyc-document.adapter.ts"
Cohesion: 0.21
Nodes (7): KycDocumentFace, KycDocumentSource, KycIdentityDocument, InjectRepository, StripeIdentityKycDocumentAdapter, Inject, Injectable

### Community 78 - "profile.controller.ts"
Cohesion: 0.07
Nodes (33): PROFIL_REPOSITORY, ProfilRepository, CreateKycUseCase, Inject, Injectable, CreateProfilPMUseCase, Inject, Injectable (+25 more)

### Community 79 - "compilerOptions"
Cohesion: 0.09
Nodes (22): compilerOptions, allowSyntheticDefaultImports, baseUrl, declaration, emitDecoratorMetadata, esModuleInterop, experimentalDecorators, forceConsistentCasingInFileNames (+14 more)

### Community 80 - "IfuGenerationService"
Cohesion: 0.12
Nodes (14): AdminFiscalController, ApiBearerAuth, ApiOperation, ApiParam, ApiTags, Controller, HttpCode, InjectRepository (+6 more)

### Community 81 - "reservation.controller.ts"
Cohesion: 0.23
Nodes (9): RESERVATION_REPOSITORY, ReservationsModule, Module, CancelReservationUseCase, TODO: Store motif when reservation domain model is updated, Injectable, ReservationStatus, ReservationsInfrastructureModule (+1 more)

### Community 82 - "AdminSettingsController"
Cohesion: 0.12
Nodes (16): AdminSettingsController, ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags, Body, Controller (+8 more)

### Community 83 - "ApiOperation"
Cohesion: 0.36
Nodes (7): ApiBearerAuth, ApiOperation, ApiResponse, Body, HttpCode, Post, Throttle

### Community 84 - ".detach"
Cohesion: 0.21
Nodes (10): ApiOperation, ApiParam, ApiResponse, Body, Delete, Get, HttpCode, Param (+2 more)

### Community 85 - "OtpRecordStore"
Cohesion: 0.14
Nodes (9): OtpRecord, OtpRecordStore, readPositiveInt(), build(), makeStore(), Inject, CacheOtpRecordStoreAdapter, Inject (+1 more)

### Community 86 - "Seed Service Amélioré"
Cohesion: 0.10
Nodes (20): Configuration par défaut, Configuration personnalisée, 📊 Données améliorées, Données financières, Dépannage, Erreurs communes, Extensibilité, Forcer le nettoyage complet (+12 more)

### Community 87 - "AdminEmailTemplatesController"
Cohesion: 0.20
Nodes (13): AdminEmailTemplatesController, ApiBearerAuth, ApiOperation, ApiResponse, ApiTags, Body, Controller, Get (+5 more)

### Community 88 - "TransactionalEmailNotifier"
Cohesion: 0.19
Nodes (8): Inject, Injectable, UserEmailRecipientAdapter, EmailRecipient, EmailRecipientReader, TransactionalEmailNotifier, Inject, Injectable

### Community 89 - "MfaMethod"
Cohesion: 0.06
Nodes (19): DELIVERING_CHANNELS, maskEmail(), maskPhone(), MfaMethod, email(), factor(), sms(), totp() (+11 more)

### Community 90 - "UpdatePreferencesDto"
Cohesion: 0.30
Nodes (13): PreferenceBooleanDto, PreferenceLangueDto, SetUserTypeDto, ApiProperty, ApiPropertyOptional, IsBoolean, IsIn, IsOptional (+5 more)

### Community 91 - "SpvEntity"
Cohesion: 0.20
Nodes (11): RegimeFiscal, Spv, SpvEntity, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn (+3 more)

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

### Community 96 - "StripeIdentityServiceImpl"
Cohesion: 0.11
Nodes (7): KycImageUrls, KycReportData, STRIPE_IDENTITY_SERVICE, StripeIdentityService, StripeIdentityServiceImpl, Injectable, VerificationSessionResult

### Community 97 - ".adminCancel"
Cohesion: 0.21
Nodes (14): ReservationController, ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags, Body, Controller (+6 more)

### Community 98 - "scripts"
Cohesion: 0.11
Nodes (19): scripts, build, format, lint, migration:drop, migration:generate, migration:revert, migration:run (+11 more)

### Community 99 - "DeclarerVersementPorteurDto"
Cohesion: 0.16
Nodes (15): DeclarerVersementPorteurDto, ListerEtatsFinanciersDto, ApiProperty, ApiPropertyOptional, IsDateString, IsInt, IsNotEmpty, IsNumber (+7 more)

### Community 100 - "main.ts"
Cohesion: 0.15
Nodes (11): AppModule, Module, bootstrap(), SentryExceptionFilter, Catch, initSentry(), scrub(), SENSITIVE_KEYS (+3 more)

### Community 101 - "mfa.dto.ts"
Cohesion: 0.22
Nodes (18): DisableMfaDto, EnableMfaDto, EnrollMfaDto, MfaChallengeDto, MfaChallengeIssuedDto, MfaEnrollmentChallengeDto, MfaMethodResponseDto, MfaMethodSummaryDto (+10 more)

### Community 102 - ".generate"
Cohesion: 0.18
Nodes (13): AdminReportsController, EXPORT_ROLES, REPORT_TYPES, ApiBearerAuth, ApiOperation, ApiResponse, ApiTags, Controller (+5 more)

### Community 103 - "AdminRetraitsController"
Cohesion: 0.13
Nodes (15): AdminRetraitsController, STATUTS, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags (+7 more)

### Community 104 - "Public"
Cohesion: 0.25
Nodes (10): Public(), AuthenticationController, ApiTags, Controller, Get, Query, Req, Res (+2 more)

### Community 105 - "notification-test.controller.ts"
Cohesion: 0.16
Nodes (15): NotificationTestController, ApiOperation, ApiResponse, ApiTags, Body, Controller, HttpCode, Post (+7 more)

### Community 106 - "EmailService"
Cohesion: 0.10
Nodes (5): Inject, Inject, Inject, InjectRepository, EmailService

### Community 107 - "AdminInvestorsController"
Cohesion: 0.14
Nodes (12): AdminInvestorsController, ROLE_ASSIGN_ROLES, ApiBearerAuth, ApiOperation, ApiTags, Body, Controller, Get (+4 more)

### Community 108 - "StripePaymentService"
Cohesion: 0.14
Nodes (7): CreatePaymentIntentParams, PAYMENT_SERVICE, PaymentIntentResult, PaymentService, StripePaymentService, Injectable, ADR-0002

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
Cohesion: 0.12
Nodes (17): jest, collectCoverageFrom, coverageDirectory, maxWorkers, moduleFileExtensions, moduleNameMapper, rootDir, testEnvironment (+9 more)

### Community 115 - "round2"
Cohesion: 0.14
Nodes (16): AdminSecondaryMarketController, ApiBearerAuth, ApiOperation, ApiQuery, ApiTags, Controller, Get, HttpCode (+8 more)

### Community 116 - "AdminSettingsEntity"
Cohesion: 0.18
Nodes (8): InjectRepository, AdminSettingsEntity, Column, Entity, PrimaryColumn, UpdateDateColumn, InjectRepository, InjectRepository

### Community 117 - "AuditLogController"
Cohesion: 0.13
Nodes (12): describeAuditAction(), OBJET, SUFFIXES, VERBE, AuditLogController, ApiBearerAuth, ApiOperation, ApiQuery (+4 more)

### Community 118 - "AdminFiscaliteController"
Cohesion: 0.18
Nodes (9): Cron, AdminFiscaliteController, ApiBearerAuth, ApiOperation, ApiTags, Controller, Param, Post (+1 more)

### Community 119 - "NotificationGateway"
Cohesion: 0.10
Nodes (11): ConnectedSocket, MessageBody, Inject, InjectRepository, NotificationGateway, originesAutorisees(), jwt, verifierOrigine() (+3 more)

### Community 120 - ".handleStripeWebhook"
Cohesion: 0.19
Nodes (4): ApiHeader, Headers, Req, SkipThrottle

### Community 121 - "Runbook de lancement — BeOwn"
Cohesion: 0.13
Nodes (15): 0. Comment lire ce document, 10. Rollback — vue d'ensemble, 11. Ne jamais faire, 12. État d'avancement — à tenir à jour, 2. Comptes et accès prestataires, 5.1 Choisir le transport, 5.2 Configurer le SMTP, 5.3 SMS (+7 more)

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
Cohesion: 0.27
Nodes (5): ConnectAccountReader, ConnectAccountStatus, PayoutMethodsWriter, ManagePayoutMethodsUseCase, Injectable

### Community 127 - ".pushToAdmins"
Cohesion: 0.12
Nodes (10): Cron, ApiExcludeController, Body, Controller, Headers, HttpCode, Post, Req (+2 more)

### Community 128 - "StripePayoutMethodsService"
Cohesion: 0.26
Nodes (3): PayoutMethodView, StripePayoutMethodsService, Injectable

### Community 129 - "broadcast.service.ts"
Cohesion: 0.11
Nodes (18): BROADCAST_PREF_DEFAULTS, BroadcastEvent, BroadcastResult, BroadcastStats, CampaignConfig, CAMPAIGNS, Recipient, Deps (+10 more)

### Community 130 - "ConflitsInteretsService"
Cohesion: 0.40
Nodes (3): ConflitsInteretsService, Injectable, InjectRepository

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
Cohesion: 0.22
Nodes (7): InvestisseurDistributionsController, ApiBearerAuth, ApiOperation, ApiTags, Controller, Get, UseGuards

### Community 136 - "RedisThrottlerStorage"
Cohesion: 0.18
Nodes (7): Optional, RedisThrottlerStorage, FakeRedis, Injectable, ThrottlerStorageModule, Global, Module

### Community 137 - "CreateBailDto"
Cohesion: 0.18
Nodes (13): CreateBailDto, CreateLocataireInline, ApiProperty, IsDateString, IsEmail, IsNotEmpty, IsNumber, IsOptional (+5 more)

### Community 138 - "DeclareChargeDto"
Cohesion: 0.18
Nodes (11): DeclareChargeDto, ApiProperty, ArrayMinSize, IsArray, IsDateString, IsEnum, IsNumber, IsString (+3 more)

### Community 139 - "dependencies"
Cohesion: 0.15
Nodes (13): bcrypt, @nestjs/cache-manager, @nestjs/event-emitter, @nestjs/mapped-types, @nestjs/swagger, dependencies, bcrypt, @nestjs/cache-manager (+5 more)

### Community 140 - "SeedService"
Cohesion: 0.23
Nodes (6): bootstrap(), SeedModule, Module, runMigrations(), SeedService, Injectable

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
Cohesion: 0.18
Nodes (8): Comptes de test (17 comptes, 13 rôles), Contraintes à respecter pendant les tests, Endpoints utiles (vérifiés), Environnement de test local — BeOwn, Obligatoire après TOUT insert SQL manuel : réaligner les séquences, Reset complet (destructif — à coordonner), Services, Stripe

### Community 145 - "Plan de Gestion Extinctive (Run-off) — BeOwn"
Cohesion: 0.17
Nodes (12): 1. Notification (J+0), 2. Gel des nouvelles activités (J+1 à J+7), 3. Transfert vers gestionnaire extinctif (J+7 à J+30), 4. Continuation des remboursements (J+30 → fin de tous les investissements), Contacts d'urgence, Données critiques à sauvegarder, Exports d'urgence (à pouvoir générer en 1h), Objectif (+4 more)

### Community 146 - "AdminComplianceController"
Cohesion: 0.18
Nodes (10): AdminComplianceController, ApiBearerAuth, ApiOperation, ApiTags, Body, Controller, Get, Param (+2 more)

### Community 147 - "CreateInvestmentDto"
Cohesion: 0.24
Nodes (13): CreateInvestmentDto, TopUpDto, ApiProperty, ApiPropertyOptional, IsBoolean, IsEnum, IsInt, IsOptional (+5 more)

### Community 148 - "SignUpDto"
Cohesion: 0.29
Nodes (11): ForgotPasswordDto, ResetPasswordDto, SignUpDto, ApiProperty, ApiPropertyOptional, IsEmail, IsNotEmpty, IsOptional (+3 more)

### Community 149 - "project-timeline-cron.service.ts"
Cohesion: 0.21
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

### Community 159 - "RetraitsReaperService"
Cohesion: 0.11
Nodes (14): RetraitsReaperService, Cron, Injectable, AdminRetraitsReapController, ROLES_RETRAITS, ApiBearerAuth, ApiOperation, ApiResponse (+6 more)

### Community 160 - "ProjectRepository"
Cohesion: 0.09
Nodes (10): ProjectRepository, Inject, Inject, InMemoryProjectRepository, Inject, Project, Garantie, PrevisionnelFinancier (+2 more)

### Community 161 - "reconciliation.service.ts"
Cohesion: 0.13
Nodes (15): RapportReconciliation, STATUTS_MOUVEMENT_APPLIQUE, EcartRapprochement, EcritureGrandLivre, fondsDetenus(), grandLivreEquilibre(), grandLivreRapproche(), mouvementsDepuisInstantanes() (+7 more)

### Community 162 - "ADR — Le grand livre n'a que deux colonnes de portefeuille (suppression du doublon `wallet_source`)"
Cohesion: 0.22
Nodes (8): ADR — Le grand livre n'a que deux colonnes de portefeuille (suppression du doublon `wallet_source`), Conséquence sur le schéma — PAS de `migration:run`, Contexte — trois colonnes de portefeuille pour deux rôles, Dette assumée, Décision 1 — Deux colonnes, et deux seulement, Décision 2 — Le sens de chaque écriture est fixé par type, Décision 3 — Le rapprochement devient une primitive du domaine, Rattrapage des données existantes

### Community 163 - "probe-instant-payout.ts"
Cohesion: 0.39
Nodes (8): cleanup(), describeExternalAccount(), fail(), KEEP, main(), SKIP_TRANSFER, stripe, title()

### Community 164 - "InMemoryPayoutMethodsAdapter"
Cohesion: 0.19
Nodes (3): InstantBalanceView, InMemoryPayoutMethodsAdapter, Injectable

### Community 165 - "4. Stripe"
Cohesion: 0.25
Nodes (8): 4.1 Faire valider l'activité par Stripe — avant tout le reste, 4.2 Activer le compte plateforme, 4.3 Passer en clés live, 4.4 Déclarer les webhooks, 4.5 Onboarding Stripe Connect, de bout en bout, au moins une fois, 4.6 Cartes de débit externes — état réel, 4.7 Rotation et stockage des clés, 4. Stripe

### Community 166 - "UpdateEcheanceDto"
Cohesion: 0.36
Nodes (8): InitializeScheduleDto, IsDateString, IsEnum, IsNumber, IsOptional, Min, UpdateAggregatedEcheanceDto, UpdateEcheanceDto

### Community 167 - "iam-error.filter.spec.ts"
Cohesion: 0.05
Nodes (34): AccountStatusGuard, expectRejection(), Injectable, InjectRepository, ACCOUNT_CLOSED_CODE, ACCOUNT_CLOSED_MESSAGE, ACCOUNT_DELETION_BLOCKED_CODE, ACCOUNT_SUSPENDED_CODE (+26 more)

### Community 168 - "AdminTransactionsLitigesController"
Cohesion: 0.17
Nodes (9): AdminTransactionsLitigesController, ROLES_LITIGES, ADMIN, ApiBearerAuth, ApiOperation, ApiTags, Controller, Get (+1 more)

### Community 169 - "package.json"
Cohesion: 0.29
Nodes (6): author, description, license, name, private, version

### Community 170 - "CreateReservationUseCase"
Cohesion: 0.29
Nodes (4): CreateReservationUseCase, Inject, Injectable, Inject

### Community 171 - "À la charge du fondateur"
Cohesion: 0.33
Nodes (6): F1 — Comptes prestataires à ouvrir et à activer, F2 — Licence de la police Helvetica Now, F3 — Structure juridique et documents, F4 — Arbitrages en attente, F5 — Points techniques bloquants qui vous appartiennent aussi, À la charge du fondateur

### Community 172 - "3. Variables d'environnement et secrets"
Cohesion: 0.33
Nodes (6): 3.1 Comment la configuration arrive dans l'application, 3.2 Tableau exhaustif de `.env.example`, 3.3 Variables lues par le code mais absentes de `.env.example`, 3.4 Écarts entre le template de secrets et le besoin réel, 3.5 Créer les secrets d'un environnement, 3. Variables d'environnement et secrets

### Community 173 - "9. Observabilité et alertes"
Cohesion: 0.33
Nodes (6): 9.1 Ce que `k8s/monitoring/` déploie, 9.2 Installer la collecte, 9.3 Les alertes qui existent, 9.4 Les alertes qui ne se déclencheront jamais — à savoir avant de s'y fier, 9.5 Où regarder en cas d'incident, 9. Observabilité et alertes

### Community 174 - "15. Contenu marketing à remplacer"
Cohesion: 0.33
Nodes (6): 15.1 — Localisation, 15.2 — Section cible (remplace les 5 formules immo), 15.3 — Mention de transition (optionnelle, en haut de page), 15.4 — Cohérence terminologique (libellés front ↔ API), 15. Contenu marketing à remplacer, **6. Indicateurs financiers BeOwn**

### Community 175 - "4. Domain — `KpiCalculator` (cœur testable)"
Cohesion: 0.33
Nodes (6): 4.1 — `computeIrr` (Newton-Raphson), 4.2 — `computeWal` (Weighted Average Life), 4.3 — `computeNetInterests` (PFU / barème / dispense), 4.4 — `deriveEcheanceStatus`, 4.5 — Agrégations, 4. Domain — `KpiCalculator` (cœur testable)

### Community 176 - "8. Statuts & crons"
Cohesion: 0.33
Nodes (6): 8.1 — Évolution de `EcheanceStatus`, 8.2 — `EcheanceStatusJob`, 8.3 — `AdminKpiSnapshotJob`, 8.4 — Events émis, 8.5 — Perte définitive (action manuelle admin), 8. Statuts & crons

### Community 177 - "MetricsPort"
Cohesion: 0.05
Nodes (45): InjectThrottlerOptions, InjectThrottlerStorage, InjectRepository, AML_THRESHOLD_MONTHLY, AML_THRESHOLD_SINGLE, AmlContext, AmlMonitorService, Inject (+37 more)

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

### Community 182 - "ExchangeCodeDto"
Cohesion: 0.40
Nodes (5): ExchangeCodeDto, RefreshTokenDto, ApiProperty, IsNotEmpty, IsUUID

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

### Community 190 - "PayoutMethodsController"
Cohesion: 0.20
Nodes (9): ControllerClass, guardsOf(), hasKycGuard(), PayoutMethodsController, ApiBearerAuth, ApiTags, Controller, UseFilters (+1 more)

### Community 191 - "news.controller.ts"
Cohesion: 0.07
Nodes (42): ArrayMaxSize, ALLOWED_TAGS, analyzeHtml(), decodeEntities(), GLOBAL_ATTRS, IsSafeHtml, isSafeUrl(), SAFE_URL_PREFIXES (+34 more)

### Community 192 - "InitiateInvestmentDto"
Cohesion: 0.40
Nodes (5): InitiateInvestmentDto, ApiProperty, IsInt, IsPositive, IsUUID

### Community 193 - "PlatformFeesService"
Cohesion: 0.16
Nodes (14): PlatformFeesModule, Global, Module, DEFAULT_FEE_RATES, PlatformFeeRates, PlatformFeesService, Injectable, PublicFeesController (+6 more)

### Community 194 - "KycEntity"
Cohesion: 0.10
Nodes (14): Kyc, KycEntity, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne (+6 more)

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

### Community 217 - ".getRates"
Cohesion: 0.22
Nodes (4): ApiOperation, Get, round2(), round2()

### Community 218 - "ADR — Migrations TypeORM retirées du pipeline de déploiement"
Cohesion: 0.29
Nodes (6): ADR — Migrations TypeORM retirées du pipeline de déploiement, Conséquences / dette assumée, Contexte, Décision, Sortie de dette (préalable à tout lancement), Évolutions de schéma en attente de la sortie de dette

### Community 219 - "save-test-connaissances.usecase.ts"
Cohesion: 0.14
Nodes (22): appliquerTestConnaissances(), SaveTestConnaissancesUseCase, TestConnaissancesResponse, Injectable, versReponseTestConnaissances(), AVERTISSEMENT_INADEQUATION, DomaineTestConnaissances, evaluerTestConnaissances() (+14 more)

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

### Community 239 - "CreateReservationDto"
Cohesion: 0.25
Nodes (8): CancelReservationDto, CreateReservationDto, ApiProperty, IsNotEmpty, IsNumber, IsPositive, IsString, IsUUID

### Community 243 - "DepotCleanupCronService"
Cohesion: 0.33
Nodes (4): DepotCleanupCronService, Cron, Injectable, InjectRepository

### Community 309 - "redirect-url.ts"
Cohesion: 0.57
Nodes (5): estRedirectionAutorisee(), normaliserOrigine(), resoudreUrlRedirection(), SCHEMAS_AUTORISES, ALLOWLIST

### Community 311 - "PlateformeBalanceReader"
Cohesion: 0.39
Nodes (4): PlateformeBalanceReader, SoldePlateforme, StripePlateformeBalanceAdapter, Injectable

### Community 312 - "UpdateUserStatusDto"
Cohesion: 0.29
Nodes (7): ApiProperty, ApiPropertyOptional, IsEnum, IsOptional, IsString, MaxLength, UpdateUserStatusDto

### Community 313 - "CreateProjectUseCase"
Cohesion: 0.38
Nodes (3): CreateProjectUseCase, Inject, Injectable

### Community 314 - "payment.controller.apport-porteur.spec.ts"
Cohesion: 0.40
Nodes (3): AUTRE_PORTEUR, DTO, PORTEUR

### Community 315 - "ProjectViewEntity"
Cohesion: 0.29
Nodes (6): ProjectViewEntity, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn

### Community 316 - "SignInDto"
Cohesion: 0.33
Nodes (5): SignInDto, ApiProperty, IsEmail, IsNotEmpty, MinLength

### Community 320 - "GetInvestisseurDistributionHistoryUseCase"
Cohesion: 0.40
Nodes (3): GetInvestisseurDistributionHistoryUseCase, Inject, Injectable

### Community 322 - ".constructor"
Cohesion: 0.50
Nodes (3): Inject, InjectDataSource, InjectRepository

### Community 323 - "EmailVerificationDto"
Cohesion: 0.50
Nodes (3): EmailVerificationDto, ApiProperty, IsEmail

## Knowledge Gaps
- **663 isolated node(s):** `SEED_ENTITIES`, `SeedConfig`, `$schema`, `collection`, `sourceRoot` (+658 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **106 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ActiveUser` connect `ActiveUser` to `authentication.controller.ts`, `UserEntity`, `InvestmentEntity`, `TransactionEntity`, `InvestisseurDistributionsController`, `user.controller.ts`, `NotificationEventService`, `formatEur`, `wallet.controller.ts`, `avis.controller.ts`, `ProjectStatus`, `AdminComplianceController`, `reclamations.controller.ts`, `admin-sorties.controller.ts`, `admin-email-templates.controller.ts`, `calculate-distribution-periode.usecase.ts`, `hasPermission`, `porteur.controller.ts`, `AdminPlatformWalletController`, `payout-methods.port.ts`, `RetraitsReaperService`, `profiles.module.ts`, `locative-management.module.ts`, `ProjectController`, `yousign-webhook.controller.ts`, `investment.controller.ts`, `PaymentController`, `iam-error.filter.spec.ts`, `AdminTransactionsLitigesController`, `Document`, `RequirePermission`, `ProfileController`, `AdminEcheancesController`, `InvestmentController`, `fiscalite.module.ts`, `MetricsPort`, `RequestRetraitUseCase`, `CurrentUser`, `InvestisseurFiscaliteController`, `AdminLocativeController`, `SecondaryMarketController`, `ReconciliationService`, `.upload`, `kyc-validated.guard.ts`, `news.controller.ts`, `AdminExportsController`, `GetPorteurTresorerieUseCase`, `AdminDistributionsController`, `NotificationController`, `profile.controller.ts`, `IfuGenerationService`, `reservation.controller.ts`, `AdminSettingsController`, `ApiOperation`, `.detach`, `AdminEmailTemplatesController`, `.declarerVersement`, `AdminReservationsController`, `.verser`, `.adminCancel`, `.generate`, `AdminRetraitsController`, `Public`, `AdminInvestorsController`, `round2`, `.closeCollecte`, `CgpController`?**
  _High betweenness centrality (0.104) - this node is a cross-community bridge._
- **Why does `CurrentUser` connect `CurrentUser` to `authentication.controller.ts`, `UserEntity`, `InvestmentEntity`, `TransactionEntity`, `InvestisseurDistributionsController`, `user.controller.ts`, `NotificationEventService`, `formatEur`, `wallet.controller.ts`, `avis.controller.ts`, `ProjectStatus`, `AdminComplianceController`, `reclamations.controller.ts`, `admin-sorties.controller.ts`, `admin-email-templates.controller.ts`, `calculate-distribution-periode.usecase.ts`, `hasPermission`, `porteur.controller.ts`, `AdminPlatformWalletController`, `payout-methods.port.ts`, `RetraitsReaperService`, `profiles.module.ts`, `locative-management.module.ts`, `ProjectController`, `yousign-webhook.controller.ts`, `investment.controller.ts`, `PaymentController`, `AdminTransactionsLitigesController`, `Document`, `RequirePermission`, `ProfileController`, `AdminEcheancesController`, `ActiveUser`, `InvestmentController`, `fiscalite.module.ts`, `MetricsPort`, `SecondaryMarketController`, `InvestisseurFiscaliteController`, `AdminLocativeController`, `ReconciliationService`, `.upload`, `news.controller.ts`, `AdminExportsController`, `GetPorteurTresorerieUseCase`, `AdminDistributionsController`, `NotificationController`, `profile.controller.ts`, `IfuGenerationService`, `reservation.controller.ts`, `AdminSettingsController`, `ApiOperation`, `.detach`, `AdminEmailTemplatesController`, `.declarerVersement`, `AdminReservationsController`, `.verser`, `.adminCancel`, `.generate`, `AdminRetraitsController`, `Public`, `AdminInvestorsController`, `round2`, `.closeCollecte`, `CgpController`?**
  _High betweenness centrality (0.082) - this node is a cross-community bridge._
- **Why does `dependencies` connect `dependencies` to `@nestjs/platform-express`, `@nestjs/platform-socket.io`, `@nestjs/schedule`, `@nestjs/terminus`, `@nestjs/throttler`, `@nestjs/typeorm`, `@nestjs/websockets`, `nodemailer`, `@opentelemetry/api`, `@opentelemetry/auto-instrumentations-node`, `@opentelemetry/exporter-trace-otlp-http`, `@opentelemetry/resources`, `@opentelemetry/sdk-node`, `@opentelemetry/semantic-conventions`, `otplib`, `passport`, `passport-facebook`, `passport-google-oauth20`, `pdfkit`, `pg`, `pino`, `pino-http`, `prom-client`, `qrcode`, `reflect-metadata`, `rxjs`, `@sentry/node`, `socket.io`, `stripe`, `swagger-ui-express`, `twilio`, `typeorm`, `@types/pdfkit`, `package.json`, `email-template.service.ts`, `class-validator`, `@nestjs/passport`, `cache-manager`, `class-transformer`, `cloudinary`, `helmet`, `ioredis`, `@keyv/redis`, `@nestjs/common`, `@nestjs/config`, `@nestjs/core`, `@nestjs/cqrs`, `@nestjs/jwt`, `@getbrevo/brevo`, `nestjs-pino`?**
  _High betweenness centrality (0.058) - this node is a cross-community bridge._
- **What connects `SEED_ENTITIES`, `SeedConfig`, `$schema` to the rest of the system?**
  _663 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `authentication.module.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.03252259808032802 - nodes in this community are weakly interconnected._
- **Should `authentication.controller.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0341055341055341 - nodes in this community are weakly interconnected._
- **Should `UserEntity` be split into smaller, more focused modules?**
  _Cohesion score 0.0602020202020202 - nodes in this community are weakly interconnected._