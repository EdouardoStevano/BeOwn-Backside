# Graph Report - BeOwn-Backside  (2026-08-31)

## Corpus Check
- 740 files · ~394,739 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 5838 nodes · 16157 edges · 311 communities (207 shown, 104 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 11 edges (avg confidence: 0.66)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f1a4a569`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- authentication.module.ts
- UserRepository
- user.entity.ts
- ProjectEntity
- InvestorInactivityCronService
- WalletEntity
- mfa.usecases.spec.ts
- User
- .declarerVersement
- formatEur
- porteur.controller.ts
- InvestmentRepository
- app.module.ts
- fici.ts
- Wallet
- investor-kpi.service.ts
- avis.controller.ts
- project.controller.ts
- reclamations.controller.ts
- authentication.controller.ts
- KycEntity
- Bail
- reconciliation.service.ts
- StatutDeclaration
- admin-sorties.controller.ts
- PeriodeDistribution
- CreateBeneficiaireEffectifDto
- hasPermission
- locative-management-infrastructure.module.ts
- InMemoryPayoutMethodsAdapter
- yousign-webhook.controller.ts
- ProjectController
- register.usecase.ts
- LoyerEncaisse
- distributions.module.ts
- broadcast.service.ts
- investment.controller.ts
- PaymentController
- ContactController
- safe-html.ts
- Document
- DistributionPart
- AdminController
- SeedService
- ActiveUser
- email-template.service.ts
- RequirePermission
- CurrentUser
- InvestmentController
- DocumentFiscalEntity
- SecondaryMarketController
- StripeConnectService
- PorteurController
- .create
- sms.module.ts
- fiscalite.module.ts
- TotpGenerator
- AdminNewsController
- investor-classification.ts
- LocataireEntity
- email-driver.provider.ts
- devDependencies
- PrometheusMetricsAdapter
- .ecrire
- HashingService
- AdminSortiesController
- tableau-affichage.ts
- CLAUDE.md
- AdminDistributionsController
- NotificationController
- CreateProjectDto
- UserEntity
- Reservation
- taux-defaut-publication.ts
- notification-unsubscribe.service.spec.ts
- CreateRetraitDto
- update-admin-settings.dto.ts
- project-read-model.service.ts
- profile.controller.ts
- compilerOptions
- IfuGenerationService
- reservations.module.ts
- AdminSettingsController
- AuthenticationController
- PayoutMethodsController
- jwt-token-signer.adapter.ts
- Seed Service Amélioré
- AdminEmailTemplatesController
- TransactionalEmailNotifier
- MfaMethod
- UpdatePreferencesDto
- SpvEntity
- ReclamationsController
- AdminReservationsController
- BroadcastService
- kyc-validated.guard.ts
- StripeIdentityServiceImpl
- .adminCancel
- scripts
- main.ts
- YouSignService
- mfa.dto.ts
- .generate
- AdminRetraitsController
- Public
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
- calculate-distribution-periode.usecase.ts
- AuditLogController
- AdminFiscaliteController
- enregistrer-document-cles.usecase.ts
- NotificationGateway
- Runbook de lancement — BeOwn
- exclude
- CreateOrdreMarcheDto
- .closeCollecte
- CgpController
- fici.dto.ts
- YouSignWebhookController
- stripe-connect.service.ts
- payout-methods.port.ts
- ProfilPPEntity
- TemplatedEmailService
- Lot 2 — Investor + Project KPIs Implementation Plan
- Design — Indicateurs financiers crowdlending obligataire (KPIs BeOwn)
- probe-cache-redis.ts
- InvestisseurDistributionsController
- ConsulterDocumentClesUseCase
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
- InvestisseurFiscaliteController
- SignUpDto
- chronologie-status.ts
- ReservationEntity
- Suivis sécurité & config prod — 2026-07-21
- RedisThrottlerStorage
- UpdateEmailTemplateDto
- DeclareLoyerDto
- UpdateBailDto
- UpdateRegimeFiscalDto
- AdminPlatformWalletController
- audit.interceptor.ts
- DocumentFiscal
- update-project.usecase.ts
- ReconciliationService
- ADR — Le grand livre n'a que deux colonnes de portefeuille (suppression du doublon `wallet_source`)
- probe-instant-payout.ts
- reservation.controller.ts
- 4. Stripe
- UpdateEcheanceDto
- IamError
- broadcast.service.spec.ts
- package.json
- CancelReservationUseCase
- À la charge du fondateur
- 3. Variables d'environnement et secrets
- 9. Observabilité et alertes
- 15. Contenu marketing à remplacer
- 4. Domain — `KpiCalculator` (cœur testable)
- 8. Statuts & crons
- ResolveProjectWalletUseCase
- nest-cli.json
- route-permissions.hardening.spec.ts
- .sendLoginOtp
- AesGcmSecretCipherAdapter
- ExchangeCodeDto
- SignInDto
- NewsEntity
- 1. Carte du système
- 6. Base de données
- 7. CI/CD — Jenkins et déclenchement par GitHub
- README.md
- SetPepFlagDto
- CalculateDistributionDto
- ifu-pdf.service.ts
- InitiateInvestmentDto
- PlatformFeesService
- CreateProjectUseCase
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
- PeriodeDistributionEntity
- ADR — Migrations TypeORM retirées du pipeline de déploiement
- EnregistrerDocumentClesUseCase
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
- EnableMfaUseCase
- .unsubscribe
- bcrypt
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
- class-validator

## God Nodes (most connected - your core abstractions)
1. `ActiveUser` - 266 edges
2. `CurrentUser` - 226 edges
3. `UserEntity` - 147 edges
4. `ProjectEntity` - 109 edges
5. `InvestmentEntity` - 106 edges
6. `RequirePermission()` - 96 edges
7. `formatEur()` - 89 edges
8. `WalletEntity` - 87 edges
9. `MetricsPort` - 86 edges
10. `MfaMethodType` - 81 edges

## Surprising Connections (you probably didn't know these)
- `UserData` --references--> `UserRole`  [EXTRACTED]
  database/seeds/seed.service.improved.ts → src/iam/domains/enums/user.enum.ts
- `ProjectData` --references--> `ProjectStatus`  [EXTRACTED]
  database/seeds/seed.service.improved.ts → src/projects/domains/enums/project-status.enum.ts
- `SeedService` --references--> `UserEntity`  [EXTRACTED]
  database/seeds/seed.service.improved.ts → src/iam/infrastructure/persistence/entities/user.entity.ts
- `SeedService` --references--> `InvestmentEntity`  [EXTRACTED]
  database/seeds/seed.service.improved.ts → src/investments/infrastructure/persistences/entities/investment.entity.ts
- `SeedService` --references--> `ProjectEntity`  [EXTRACTED]
  database/seeds/seed.service.improved.ts → src/projects/infrastructure/persistences/entities/project.entity.ts

## Import Cycles
- None detected.

## Communities (311 total, 104 thin omitted)

### Community 0 - "authentication.module.ts"
Cohesion: 0.03
Nodes (86): OTP_RECORD_STORE, OtpRecord, OtpRecordStore, SECRET_CIPHER, SecretCipher, AuthMailerService, Injectable, PREFERENCE (+78 more)

### Community 1 - "UserRepository"
Cohesion: 0.03
Nodes (63): RecaptchaResponse, RecaptchaService, Injectable, AuthSession, AuthTokens, EmailTokenPayload, EmailTokenPurpose, NOTIF_UNSUBSCRIBE_TYPE (+55 more)

### Community 2 - "user.entity.ts"
Cohesion: 0.05
Nodes (49): ADMIN_ROLES, admin, makeController(), makeRow(), SAVED_AT, ADMIN_ROLES, ADMIN_ROLES, ADMIN_ROLES (+41 more)

### Community 3 - "ProjectEntity"
Cohesion: 0.04
Nodes (87): InjectRepository, OneToMany, InjectRepository, InjectRepository, InjectRepository, InjectRepository, GetAggregatedScheduleUseCase, round2() (+79 more)

### Community 4 - "InvestorInactivityCronService"
Cohesion: 0.33
Nodes (4): InvestorInactivityCronService, Cron, Injectable, InjectRepository

### Community 5 - "WalletEntity"
Cohesion: 0.05
Nodes (62): SeedConfig, InjectThrottlerOptions, InjectThrottlerStorage, ADMIN_ROLES, PLATFORM_FEE_SOURCES, CANONICAL_SOURCES, InjectRepository, InjectRepository (+54 more)

### Community 6 - "mfa.usecases.spec.ts"
Cohesion: 0.07
Nodes (36): MFA_CHALLENGE_MAX_ATTEMPTS, MfaChallenge, MfaChallengeDraft, MfaChallengePurpose, key(), MFAChallengeCacheService, build(), draft (+28 more)

### Community 7 - "User"
Cohesion: 0.03
Nodes (32): ApiProperty, ApiPropertyOptional, IsEnum, IsOptional, IsString, MaxLength, UpdateUserStatusDto, makeUserRepository() (+24 more)

### Community 8 - ".declarerVersement"
Cohesion: 0.08
Nodes (30): DeclarerVersementPorteurDto, ListerEtatsFinanciersDto, ApiProperty, ApiPropertyOptional, IsDateString, IsInt, IsNotEmpty, IsNumber (+22 more)

### Community 9 - "formatEur"
Cohesion: 0.04
Nodes (52): UserData, ADMIN_ROLES, MONTH_LABELS, InjectRepository, ADMIN_ROLES, MANAGE_ROLES, ADMIN_ROLES, CancelCollecteDto (+44 more)

### Community 10 - "porteur.controller.ts"
Cohesion: 0.09
Nodes (30): LocativeManagementModule, Module, BAIL_REPOSITORY, BailRepository, LOCATAIRE_REPOSITORY, UNITE_LOUABLE_REPOSITORY, UniteLouableRepository, AddUniteLouableInput (+22 more)

### Community 11 - "InvestmentRepository"
Cohesion: 0.06
Nodes (13): InvestmentRepository, ContractData, ContratRachatData, TopUpInvestmentUseCase, Inject, Injectable, InjectDataSource, Investment (+5 more)

### Community 12 - "app.module.ts"
Cohesion: 0.05
Nodes (59): AdminModule, Module, AppModule, Module, CgpModule, Module, AmlModule, Module (+51 more)

### Community 13 - "fici.ts"
Cohesion: 0.22
Nodes (16): VueDocumentCles, AIDE_SECTIONS, AVERTISSEMENT_ABSENCE_GARANTIE, AVERTISSEMENT_LIMINAIRE, AVERTISSEMENTS, decrireVerdict(), INTITULES_SECTIONS, LANGUE_ATTENDUE (+8 more)

### Community 14 - "Wallet"
Cohesion: 0.07
Nodes (27): WalletRepository, Wallet, Injectable, WalletTypeOrmRepository, CreateTransactionDto, CreateWalletDto, ApiProperty, ApiPropertyOptional (+19 more)

### Community 15 - "investor-kpi.service.ts"
Cohesion: 0.08
Nodes (32): InvestorKpiService, Injectable, KpiCache, ProjectKpiService, Inject, Injectable, InjectRepository, aggregateExposureBy() (+24 more)

### Community 16 - "avis.controller.ts"
Cohesion: 0.05
Nodes (43): Check, AvisModule, Module, AVIS_REPOSITORY, AvisRepository, Avis, AvisInfrastructureModule, Module (+35 more)

### Community 17 - "project.controller.ts"
Cohesion: 0.10
Nodes (20): ProjectData, PROJECT_REPOSITORY, ProjectRepository, InMemoryProjectRepository, ALLOWED_TRANSITIONS, Inject, Injectable, UpdateProjectStatusUseCase (+12 more)

### Community 18 - "reclamations.controller.ts"
Cohesion: 0.09
Nodes (34): ReclamationsService, Injectable, InjectRepository, ajouterJoursOuvrables(), CategorieReclamation, DELAI_ACCUSE_RECEPTION_JOURS_OUVRABLES, DELAI_REPONSE_MOIS, echeanceAccuseReception() (+26 more)

### Community 19 - "authentication.controller.ts"
Cohesion: 0.06
Nodes (30): SocialProfile, Social, IssuedOAuthCode, CookieOAuthStateStore, FacebookAuthStrategy, Injectable, GoogleStrategy, Injectable (+22 more)

### Community 20 - "KycEntity"
Cohesion: 0.05
Nodes (33): Kyc, ProfilPM, ProfilPP, BeneficiaireEffectifEntity, Column, CreateDateColumn, Entity, Index (+25 more)

### Community 21 - "Bail"
Cohesion: 0.12
Nodes (13): Bail, StatutBail, BailEntity, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn (+5 more)

### Community 22 - "reconciliation.service.ts"
Cohesion: 0.14
Nodes (14): RapportReconciliation, EcartRapprochement, EcritureGrandLivre, fondsDetenus(), grandLivreEquilibre(), grandLivreRapproche(), mouvementsDepuisInstantanes(), MouvementWallet (+6 more)

### Community 23 - "StatutDeclaration"
Cohesion: 0.08
Nodes (26): CHARGE_REPOSITORY, ChargeRepository, DeclareChargeInput, DeclareChargeUseCase, Inject, Injectable, Inject, Injectable (+18 more)

### Community 24 - "admin-sorties.controller.ts"
Cohesion: 0.09
Nodes (27): SORTIE_PROJET_REPOSITORY, SortieProjetRepository, DeclareSortieInput, DeclareSortieUseCase, round2(), Inject, Injectable, ExecuteSortieResult (+19 more)

### Community 25 - "PeriodeDistribution"
Cohesion: 0.15
Nodes (6): PeriodeDistributionRepository, ExecuteDistributionResult, Inject, PeriodeDistribution, PeriodeDistributionTypeOrmRepository, Injectable

### Community 26 - "CreateBeneficiaireEffectifDto"
Cohesion: 0.10
Nodes (23): CreateBeneficiaireEffectifDto, ApiProperty, ApiPropertyOptional, IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString (+15 more)

### Community 27 - "hasPermission"
Cohesion: 0.14
Nodes (21): Redirect, hasPermission(), DocumentController, ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiParam (+13 more)

### Community 28 - "locative-management-infrastructure.module.ts"
Cohesion: 0.12
Nodes (14): UniteLouable, LocativeManagementInfrastructureModule, Module, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn (+6 more)

### Community 29 - "InMemoryPayoutMethodsAdapter"
Cohesion: 0.08
Nodes (18): ConnectAccountReader, ConnectAccountStatus, InstantBalanceView, PayoutMethodsReader, PayoutMethodsWriter, PayoutMethodView, ManagePayoutMethodsUseCase, Injectable (+10 more)

### Community 30 - "yousign-webhook.controller.ts"
Cohesion: 0.04
Nodes (61): SEED_ENTITIES, estIndisponibiliteFournisseur(), ContractGeneratorService, Injectable, InvestmentsInfrastructureModule, Module, AnnoncesExpiryCronService, Injectable (+53 more)

### Community 31 - "ProjectController"
Cohesion: 0.18
Nodes (16): ProjectController, ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags (+8 more)

### Community 32 - "register.usecase.ts"
Cohesion: 0.09
Nodes (19): EventsHandler, asUniqueViolation(), isEmailUniqueViolation(), POSTGRES_UNIQUE_VIOLATION, readCode(), UniqueViolation, build(), event (+11 more)

### Community 33 - "LoyerEncaisse"
Cohesion: 0.08
Nodes (20): LOYER_ENCAISSE_REPOSITORY, LoyerEncaisseRepository, DeclareLoyerInput, EtatFinancierPeriode, GetProjectEtatFinancierUseCase, Inject, Injectable, Inject (+12 more)

### Community 34 - "distributions.module.ts"
Cohesion: 0.11
Nodes (15): DistributionsCronService, Cron, Inject, Injectable, DistributionsModule, Module, CalculateDistributionPeriodeUseCase, Inject (+7 more)

### Community 35 - "broadcast.service.ts"
Cohesion: 0.10
Nodes (21): AdminSettingsEntity, BroadcastSettings, BroadcastSettingsPatch, DEFAULT_BROADCAST_SETTINGS, mergeBroadcastSettings(), Column, Entity, PrimaryColumn (+13 more)

### Community 36 - "investment.controller.ts"
Cohesion: 0.09
Nodes (33): CancelInvestmentUseCase, Injectable, InjectDataSource, calculerEcheanceRetractation(), CODE_RETRACTATION_DEJA_EFFECTUEE, CODE_RETRACTATION_DELAI_EXPIRE, CODE_RETRACTATION_INTROUVABLE, CODE_RETRACTATION_NON_APPLICABLE (+25 more)

### Community 37 - "PaymentController"
Cohesion: 0.11
Nodes (18): ApiHeader, PaymentController, ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags, Body (+10 more)

### Community 38 - "ContactController"
Cohesion: 0.12
Nodes (13): ContactController, escapeHtml(), ApiOperation, ApiResponse, ApiTags, Body, Controller, HttpCode (+5 more)

### Community 39 - "safe-html.ts"
Cohesion: 0.15
Nodes (21): ArrayMaxSize, ALLOWED_TAGS, analyzeHtml(), decodeEntities(), GLOBAL_ATTRS, IsSafeHtml, isSafeUrl(), SAFE_URL_PREFIXES (+13 more)

### Community 40 - "Document"
Cohesion: 0.07
Nodes (24): DOCUMENT_REPOSITORY, DocumentRepository, Document, DocumentType, DocumentTypeOrmRepository, Injectable, InjectRepository, parseBooleanish() (+16 more)

### Community 41 - "DistributionPart"
Cohesion: 0.09
Nodes (17): DISTRIBUTION_PART_REPOSITORY, DistributionPartRepository, CalculateDistributionResult, InvestisseurDistributionPart, InvestisseurDistributionSummary, DistributionPart, DistributionPartEntity, Column (+9 more)

### Community 42 - "AdminController"
Cohesion: 0.14
Nodes (19): ACTIVE_INVESTMENT_STATUSES, AdminController, ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse (+11 more)

### Community 44 - "ActiveUser"
Cohesion: 0.15
Nodes (17): ActiveUser, KYC_REVIEWER_ROLES, ProfileController, ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags (+9 more)

### Community 45 - "email-template.service.ts"
Cohesion: 0.07
Nodes (32): handlebars, handlebars, Inject, InjectRepository, DEFAULT_TEMPLATE_META, EmailTemplateService, extractCorps(), extractTitle() (+24 more)

### Community 46 - "RequirePermission"
Cohesion: 0.20
Nodes (18): AdminEcheancesController, AdminEcheancesItemController, PAY_ROLES, ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags (+10 more)

### Community 47 - "CurrentUser"
Cohesion: 0.15
Nodes (18): CurrentUser, ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags, Body, Controller (+10 more)

### Community 48 - "InvestmentController"
Cohesion: 0.16
Nodes (19): Roles(), InvestmentController, ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags, Body (+11 more)

### Community 49 - "DocumentFiscalEntity"
Cohesion: 0.20
Nodes (9): DocumentFiscalEntity, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn, DocumentFiscalMapper (+1 more)

### Community 50 - "SecondaryMarketController"
Cohesion: 0.16
Nodes (17): arrondi2(), SecondaryMarketController, ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags, Body (+9 more)

### Community 51 - "StripeConnectService"
Cohesion: 0.10
Nodes (8): RequestRetraitUseCase, Injectable, StripeConnectService, Injectable, InjectRepository, Inject, InjectDataSource, InjectRepository

### Community 52 - "PorteurController"
Cohesion: 0.17
Nodes (13): PorteurController, ApiBearerAuth, ApiOperation, ApiTags, Body, Controller, Get, Param (+5 more)

### Community 53 - ".create"
Cohesion: 0.13
Nodes (14): RejectDeclarationDto, ApiProperty, IsNotEmpty, IsString, AdminLocativeController, ApiBearerAuth, ApiOperation, ApiTags (+6 more)

### Community 54 - "sms.module.ts"
Cohesion: 0.12
Nodes (13): LogSmsService, Injectable, hasTwilioCredentials(), resolveSmsDriver(), SmsDriver, SmsModule, smsServiceFactory(), TWILIO_ENV (+5 more)

### Community 55 - "fiscalite.module.ts"
Cohesion: 0.24
Nodes (8): IfuCronService, Inject, Injectable, DOCUMENT_FISCAL_REPOSITORY, GenerateInvestisseurIfuUseCase, Injectable, FiscaliteInfrastructureModule, Module

### Community 56 - "TotpGenerator"
Cohesion: 0.12
Nodes (11): TOTP_GENERATOR, TotpGenerator, TotpUriParams, RFC-6238, TotpSecret, TotpSecretService, Inject, Injectable (+3 more)

### Community 57 - "AdminNewsController"
Cohesion: 0.12
Nodes (21): AdminNewsController, PublicNewsController, slugify(), ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiQuery (+13 more)

### Community 58 - "investor-classification.ts"
Cohesion: 0.05
Nodes (59): RiskScoringService, Cron, Injectable, InjectRepository, SaveQuestionnaireUseCase, Injectable, InjectRepository, appliquerTestConnaissances() (+51 more)

### Community 59 - "LocataireEntity"
Cohesion: 0.15
Nodes (13): LocataireRepository, Locataire, LocataireEntity, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn (+5 more)

### Community 60 - "email-driver.provider.ts"
Cohesion: 0.13
Nodes (15): ContactDto, IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength, emailServiceProvider, MAIL_DRIVERS (+7 more)

### Community 61 - "devDependencies"
Cohesion: 0.07
Nodes (27): eslint, eslint-config-prettier, @eslint/eslintrc, @eslint/js, eslint-plugin-prettier, @nestjs/cli, @nestjs/schematics, @nestjs/testing (+19 more)

### Community 62 - "PrometheusMetricsAdapter"
Cohesion: 0.08
Nodes (17): Header, HttpMetricsInterceptor, Injectable, HISTOGRAM_BUCKETS, MetricName, MetricsController, ApiExcludeController, Controller (+9 more)

### Community 63 - ".ecrire"
Cohesion: 0.16
Nodes (15): Put, AdminDocumentClesController, DocumentClesController, gabarit(), ApiBearerAuth, ApiBody, ApiOperation, ApiParam (+7 more)

### Community 64 - "HashingService"
Cohesion: 0.19
Nodes (6): BcryptService, Injectable, HASHING_SERVICE, HashingService, CreateUserProps, Inject

### Community 65 - "AdminSortiesController"
Cohesion: 0.12
Nodes (19): DeclareSortieDto, MarkSortieActeeDto, ApiProperty, IsDateString, IsNumber, IsOptional, IsString, IsUUID (+11 more)

### Community 66 - "tableau-affichage.ts"
Cohesion: 0.09
Nodes (29): arrondi2(), AssietteCession, BaseCalculFraisCession, calculerAssietteCession(), CODE_ANNONCE_EXPIREE, CODE_DETENTION_TROP_RECENTE, CODE_PROJET_NON_ELIGIBLE, dateCessibiliteMinimale() (+21 more)

### Community 67 - "CLAUDE.md"
Cohesion: 0.08
Nodes (25): 10. Conventions de nommage, 11. Stratégie de tests (alignée sur les couches), 12. ❌ Interdictions strictes, 13. ✅ Checklist avant de générer du code, 14. Exemple de flux complet — "Créer une commande", 15. Commandes utiles (exemple générique — à adapter au `package.json` réel), 16. Pour aller plus loin, 1. La règle d'or : direction des dépendances (+17 more)

### Community 68 - "AdminDistributionsController"
Cohesion: 0.22
Nodes (10): AdminDistributionsController, ApiBearerAuth, ApiOperation, ApiTags, Body, Controller, Get, Param (+2 more)

### Community 69 - "NotificationController"
Cohesion: 0.14
Nodes (13): NotificationController, ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags, Controller, Delete (+5 more)

### Community 70 - "CreateProjectDto"
Cohesion: 0.13
Nodes (26): IsLatitude, IsLongitude, IsUrl, CreateProjectDto, CreateSpvDto, EtapeChronologieDto, GarantieDto, toNumber() (+18 more)

### Community 71 - "UserEntity"
Cohesion: 0.05
Nodes (39): InjectRepository, InjectRepository, InjectRepository, Column, Entity, JoinColumn, OneToOne, PrimaryGeneratedColumn (+31 more)

### Community 72 - "Reservation"
Cohesion: 0.14
Nodes (5): ReservationRepository, Reservation, ReservationMapper, ReservationTypeOrmRepository, Injectable

### Community 73 - "taux-defaut-publication.ts"
Cohesion: 0.12
Nodes (18): agreger(), arrondir(), CohorteAnnuelle, construirePublication(), debutPeriodePublication(), METHODOLOGIE_TAUX_DEFAUT, pourcent(), PROFONDEUR_PUBLICATION_MOIS (+10 more)

### Community 74 - "notification-unsubscribe.service.spec.ts"
Cohesion: 0.13
Nodes (14): NotificationUnsubscribeService, buildSignerConfig(), buildTokenService(), buildTtlConfig(), Injectable, PublicUnsubscribeController, ApiOperation, ApiProperty (+6 more)

### Community 75 - "CreateRetraitDto"
Cohesion: 0.24
Nodes (17): AttachPayoutMethodDto, ConfirmDepotDto, ConnectOnboardingDto, CreatePaymentIntentDto, CreateRetraitDto, StartKycVerificationDto, ApiProperty, ApiPropertyOptional (+9 more)

### Community 76 - "update-admin-settings.dto.ts"
Cohesion: 0.18
Nodes (20): BroadcastChannelTogglesDto, BroadcastSettingsDto, CommissionsSettingsDto, FeatureFlagsSettingsDto, NotificationsSettingsDto, PlatformSettingsDto, ApiPropertyOptional, IsBoolean (+12 more)

### Community 77 - "project-read-model.service.ts"
Cohesion: 0.10
Nodes (14): ProjectReadModelService, Inject, Injectable, GetProjectsUseCase, Inject, Injectable, ProjectViewEntity, Column (+6 more)

### Community 78 - "profile.controller.ts"
Cohesion: 0.06
Nodes (49): PROFIL_REPOSITORY, ProfilRepository, CreateKycUseCase, Inject, Injectable, CreateProfilPMUseCase, Inject, Injectable (+41 more)

### Community 79 - "compilerOptions"
Cohesion: 0.09
Nodes (22): compilerOptions, allowSyntheticDefaultImports, baseUrl, declaration, emitDecoratorMetadata, esModuleInterop, experimentalDecorators, forceConsistentCasingInFileNames (+14 more)

### Community 80 - "IfuGenerationService"
Cohesion: 0.12
Nodes (14): AdminFiscalController, ApiBearerAuth, ApiOperation, ApiParam, ApiTags, Controller, HttpCode, InjectRepository (+6 more)

### Community 81 - "reservations.module.ts"
Cohesion: 0.26
Nodes (9): ProjectsInfrastructureModule, Module, RESERVATION_REPOSITORY, ReservationsModule, Module, TODO: Store motif when reservation domain model is updated, ReservationStatus, ReservationsInfrastructureModule (+1 more)

### Community 82 - "AdminSettingsController"
Cohesion: 0.15
Nodes (13): AdminSettingsController, ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags, Body, Controller (+5 more)

### Community 83 - "AuthenticationController"
Cohesion: 0.30
Nodes (11): AuthenticationController, ApiBearerAuth, ApiOperation, ApiResponse, ApiTags, Body, Controller, HttpCode (+3 more)

### Community 84 - "PayoutMethodsController"
Cohesion: 0.14
Nodes (16): PayoutMethodsController, ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags, Body, Controller (+8 more)

### Community 85 - "jwt-token-signer.adapter.ts"
Cohesion: 0.18
Nodes (9): TOKEN_SIGNER, TokenSigner, TokenSignOptions, TokenVerifyOptions, JwtTokenSignerAdapter, Inject, Injectable, TokenSignerModule (+1 more)

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
Cohesion: 0.18
Nodes (9): RegimeFiscal, Spv, SpvEntity, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn (+1 more)

### Community 92 - "ReclamationsController"
Cohesion: 0.17
Nodes (14): ReclamationsController, ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags, Body, Controller (+6 more)

### Community 93 - "AdminReservationsController"
Cohesion: 0.21
Nodes (13): AdminReservationsController, mapStatus(), ApiBearerAuth, ApiOperation, ApiTags, Body, Controller, Get (+5 more)

### Community 94 - "BroadcastService"
Cohesion: 0.19
Nodes (3): BroadcastChannelToggles, BroadcastService, Injectable

### Community 95 - "kyc-validated.guard.ts"
Cohesion: 0.18
Nodes (11): ControllerClass, guardsOf(), hasKycGuard(), KYC_NOT_VALIDATED_CODE, KYC_NOT_VALIDATED_MESSAGE, kycNotValidatedException(), KycValidatedGuard, ctx() (+3 more)

### Community 96 - "StripeIdentityServiceImpl"
Cohesion: 0.11
Nodes (7): KycImageUrls, KycReportData, STRIPE_IDENTITY_SERVICE, StripeIdentityService, StripeIdentityServiceImpl, Injectable, VerificationSessionResult

### Community 97 - ".adminCancel"
Cohesion: 0.21
Nodes (14): ReservationController, ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags, Body, Controller (+6 more)

### Community 98 - "scripts"
Cohesion: 0.11
Nodes (19): scripts, build, format, lint, migration:drop, migration:generate, migration:revert, migration:run (+11 more)

### Community 99 - "main.ts"
Cohesion: 0.19
Nodes (9): bootstrap(), SentryExceptionFilter, Catch, initSentry(), scrub(), SENSITIVE_KEYS, initTracing(), redactSpanUrl() (+1 more)

### Community 100 - "YouSignService"
Cohesion: 0.13
Nodes (12): motifIndisponibilite, SIGNATURE_PROVIDER_UNAVAILABLE, SignatureProviderUnavailableError, DELAI_AVANT_NOUVELLE_TENTATIVE_S, MESSAGE_SIGNATURE_INDISPONIBLE, SignatureProviderExceptionFilter, Catch, Module (+4 more)

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
Cohesion: 0.33
Nodes (6): Public(), Get, Query, Req, Res, UseGuards

### Community 105 - ".testEmail"
Cohesion: 0.16
Nodes (14): NotificationTestController, ApiOperation, ApiResponse, ApiTags, Body, Controller, HttpCode, Inject (+6 more)

### Community 107 - "AdminInvestorsController"
Cohesion: 0.16
Nodes (11): AdminInvestorsController, ROLE_ASSIGN_ROLES, ApiBearerAuth, ApiOperation, ApiTags, Body, Controller, Get (+3 more)

### Community 108 - "StripePaymentService"
Cohesion: 0.11
Nodes (10): CreatePaymentIntentParams, PAYMENT_SERVICE, PaymentIntentResult, PaymentService, StripePaymentService, Injectable, PlateformeBalanceReader, SoldePlateforme (+2 more)

### Community 109 - "ProjectLedgerService"
Cohesion: 0.20
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
Nodes (18): IsDefined, IsObject, FiciDto, SlugParamDto, ApiProperty, ApiPropertyOptional, IsIn, IsInt (+10 more)

### Community 114 - "jest"
Cohesion: 0.12
Nodes (17): jest, collectCoverageFrom, coverageDirectory, maxWorkers, moduleFileExtensions, moduleNameMapper, rootDir, testEnvironment (+9 more)

### Community 115 - "round2"
Cohesion: 0.11
Nodes (18): AdminSecondaryMarketController, ApiBearerAuth, ApiOperation, ApiQuery, ApiTags, Controller, Get, HttpCode (+10 more)

### Community 116 - "calculate-distribution-periode.usecase.ts"
Cohesion: 0.32
Nodes (5): PERIODE_DISTRIBUTION_REPOSITORY, Injectable, ValidatePeriodeDistributionUseCase, StatutPeriodeDistribution, PeriodeDistributionMapper

### Community 117 - "AuditLogController"
Cohesion: 0.13
Nodes (12): describeAuditAction(), OBJET, SUFFIXES, VERBE, AuditLogController, ApiBearerAuth, ApiOperation, ApiQuery (+4 more)

### Community 118 - "AdminFiscaliteController"
Cohesion: 0.16
Nodes (10): Cron, round2(), AdminFiscaliteController, ApiBearerAuth, ApiOperation, ApiTags, Controller, Param (+2 more)

### Community 119 - "enregistrer-document-cles.usecase.ts"
Cohesion: 0.22
Nodes (9): EnregistrerDocumentClesInput, EnregistrerDocumentClesResult, FICI_VALIDE, makeDeps(), makeProject(), ContenuFici, SectionFici, SECTIONS_REQUISES (+1 more)

### Community 120 - "NotificationGateway"
Cohesion: 0.10
Nodes (11): ConnectedSocket, MessageBody, Inject, InjectRepository, NotificationGateway, originesAutorisees(), jwt, verifierOrigine() (+3 more)

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
Cohesion: 0.20
Nodes (10): CgpController, ApiBearerAuth, ApiOperation, ApiTags, Controller, Get, InjectRepository, Param (+2 more)

### Community 126 - "fici.dto.ts"
Cohesion: 0.19
Nodes (8): analyserSections(), LANGUES_ACCEPTEES, LONGUEUR_MAX_SECTION, LONGUEUR_MIN_SECTION, SectionsDocumentClesConstraint, meta, pipe, ValidatorConstraint

### Community 127 - "YouSignWebhookController"
Cohesion: 0.16
Nodes (9): ApiExcludeController, Body, Controller, Headers, HttpCode, Post, Req, SkipThrottle (+1 more)

### Community 128 - "stripe-connect.service.ts"
Cohesion: 0.18
Nodes (13): InvestorIdentity, InvestorIdentityReader, buildIndividualPrefill(), clean(), cleanCountry(), cleanDob(), cleanPhone(), IndividualPrefill (+5 more)

### Community 129 - "payout-methods.port.ts"
Cohesion: 0.15
Nodes (15): ADR-0003, PayoutMethodError, PayoutMethodErrorCode, PayoutMethodKind, PayoutMethodType, ADR-0002, ResolvedPayoutDestination, ResolvePayoutDestinationInput (+7 more)

### Community 130 - "ProfilPPEntity"
Cohesion: 0.13
Nodes (18): ProfilPPEntity, Column, CreateDateColumn, Entity, JoinColumn, OneToOne, PrimaryColumn, UpdateDateColumn (+10 more)

### Community 131 - "TemplatedEmailService"
Cohesion: 0.09
Nodes (10): PlatformSettingsService, Injectable, InjectRepository, BrevoEmailService, Injectable, MailpitEmailService, Injectable, NodemailerEmailService (+2 more)

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

### Community 136 - "ConsulterDocumentClesUseCase"
Cohesion: 0.20
Nodes (6): makeService(), ConsulterDocumentClesUseCase, contenuComplet, projet(), Inject, Injectable

### Community 137 - "CreateBailDto"
Cohesion: 0.18
Nodes (13): CreateBailDto, CreateLocataireInline, ApiProperty, IsDateString, IsEmail, IsNotEmpty, IsNumber, IsOptional (+5 more)

### Community 138 - "DeclareChargeDto"
Cohesion: 0.18
Nodes (11): DeclareChargeDto, ApiProperty, ArrayMinSize, IsArray, IsDateString, IsEnum, IsNumber, IsString (+3 more)

### Community 139 - "dependencies"
Cohesion: 0.15
Nodes (13): @nestjs/cache-manager, @nestjs/event-emitter, @nestjs/mapped-types, @nestjs/passport, @nestjs/swagger, dependencies, @nestjs/cache-manager, @nestjs/event-emitter (+5 more)

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

### Community 147 - "InvestisseurFiscaliteController"
Cohesion: 0.22
Nodes (9): InvestisseurFiscaliteController, ApiBearerAuth, ApiOperation, ApiTags, Controller, Get, Param, Res (+1 more)

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

### Community 152 - "RedisThrottlerStorage"
Cohesion: 0.18
Nodes (7): Optional, RedisThrottlerStorage, FakeRedis, Injectable, ThrottlerStorageModule, Global, Module

### Community 153 - "UpdateEmailTemplateDto"
Cohesion: 0.25
Nodes (7): ApiPropertyOptional, IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength, UpdateEmailTemplateDto

### Community 154 - "DeclareLoyerDto"
Cohesion: 0.18
Nodes (10): DeclareLoyerDto, ApiProperty, ArrayMinSize, IsArray, IsDateString, IsNumber, IsString, IsUUID (+2 more)

### Community 155 - "UpdateBailDto"
Cohesion: 0.24
Nodes (10): ResilierBailDto, ApiProperty, IsDateString, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString (+2 more)

### Community 156 - "UpdateRegimeFiscalDto"
Cohesion: 0.24
Nodes (8): RegimeFiscal, IsEnum, IsNumber, IsOptional, Max, Min, ValidateIf, UpdateRegimeFiscalDto

### Community 157 - "AdminPlatformWalletController"
Cohesion: 0.24
Nodes (7): AdminPlatformWalletController, ApiBearerAuth, ApiOperation, ApiTags, Controller, Get, UseGuards

### Community 158 - "audit.interceptor.ts"
Cohesion: 0.31
Nodes (5): AUDIT_EXCLUDED_RESOURCES, AuditInterceptor, MUTATING, sanitizeBody(), Injectable

### Community 159 - "DocumentFiscal"
Cohesion: 0.22
Nodes (5): DocumentFiscalRepository, Inject, DocumentFiscal, DocumentFiscalTypeOrmRepository, Injectable

### Community 160 - "update-project.usecase.ts"
Cohesion: 0.19
Nodes (12): Inject, Injectable, UpdateProjectDto, UpdateProjectUseCase, arrondir(), debutFenetreGlissante(), FENETRE_GLISSANTE_MOIS, OffrePorteur (+4 more)

### Community 161 - "ReconciliationService"
Cohesion: 0.10
Nodes (16): ReconciliationCronService, Cron, Injectable, ReconciliationService, Injectable, AdminReconciliationController, ApiBearerAuth, ApiOperation (+8 more)

### Community 162 - "ADR — Le grand livre n'a que deux colonnes de portefeuille (suppression du doublon `wallet_source`)"
Cohesion: 0.22
Nodes (8): ADR — Le grand livre n'a que deux colonnes de portefeuille (suppression du doublon `wallet_source`), Conséquence sur le schéma — PAS de `migration:run`, Contexte — trois colonnes de portefeuille pour deux rôles, Dette assumée, Décision 1 — Deux colonnes, et deux seulement, Décision 2 — Le sens de chaque écriture est fixé par type, Décision 3 — Le rapprochement devient une primitive du domaine, Rattrapage des données existantes

### Community 163 - "probe-instant-payout.ts"
Cohesion: 0.39
Nodes (8): cleanup(), describeExternalAccount(), fail(), KEEP, main(), SKIP_TRANSFER, stripe, title()

### Community 164 - "reservation.controller.ts"
Cohesion: 0.17
Nodes (11): CreateReservationUseCase, Inject, Injectable, CancelReservationDto, CreateReservationDto, ApiProperty, IsNotEmpty, IsNumber (+3 more)

### Community 165 - "4. Stripe"
Cohesion: 0.25
Nodes (8): 4.1 Faire valider l'activité par Stripe — avant tout le reste, 4.2 Activer le compte plateforme, 4.3 Passer en clés live, 4.4 Déclarer les webhooks, 4.5 Onboarding Stripe Connect, de bout en bout, au moins une fois, 4.6 Cartes de débit externes — état réel, 4.7 Rotation et stockage des clés, 4. Stripe

### Community 166 - "UpdateEcheanceDto"
Cohesion: 0.36
Nodes (8): InitializeScheduleDto, IsDateString, IsEnum, IsNumber, IsOptional, Min, UpdateAggregatedEcheanceDto, UpdateEcheanceDto

### Community 167 - "IamError"
Cohesion: 0.05
Nodes (42): RFC-5321, RFC-5322, AccountStatusGuard, expectRejection(), Injectable, InjectRepository, buildUser(), ACCOUNT_CLOSED_CODE (+34 more)

### Community 168 - "broadcast.service.spec.ts"
Cohesion: 0.36
Nodes (5): Deps, makeDeps(), makePrefs(), makeProject(), makeUser()

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

### Community 177 - "ResolveProjectWalletUseCase"
Cohesion: 0.08
Nodes (15): InjectRepository, CollecteCloseCronService, Cron, Injectable, InjectRepository, ConfirmRetractationCronService, Cron, Injectable (+7 more)

### Community 178 - "nest-cli.json"
Cohesion: 0.33
Nodes (5): collection, compilerOptions, deleteOutDir, $schema, sourceRoot

### Community 179 - "route-permissions.hardening.spec.ts"
Cohesion: 0.43
Nodes (5): allows(), contextFor(), ControllerClass, expectForbidden(), guard

### Community 182 - "ExchangeCodeDto"
Cohesion: 0.40
Nodes (5): ExchangeCodeDto, RefreshTokenDto, ApiProperty, IsNotEmpty, IsUUID

### Community 183 - "SignInDto"
Cohesion: 0.33
Nodes (5): SignInDto, ApiProperty, IsEmail, IsNotEmpty, MinLength

### Community 184 - "NewsEntity"
Cohesion: 0.22
Nodes (8): InjectRepository, NewsEntity, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn

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

### Community 190 - "CalculateDistributionDto"
Cohesion: 0.40
Nodes (4): CalculateDistributionDto, ApiProperty, IsUUID, Matches

### Community 191 - "ifu-pdf.service.ts"
Cohesion: 0.29
Nodes (4): IfuPdfService, InvestorInfo, Injectable, Inject

### Community 192 - "InitiateInvestmentDto"
Cohesion: 0.40
Nodes (5): InitiateInvestmentDto, ApiProperty, IsInt, IsPositive, IsUUID

### Community 193 - "PlatformFeesService"
Cohesion: 0.16
Nodes (14): PlatformFeesModule, Global, Module, DEFAULT_FEE_RATES, PlatformFeeRates, PlatformFeesService, Injectable, PublicFeesController (+6 more)

### Community 194 - "CreateProjectUseCase"
Cohesion: 0.38
Nodes (3): CreateProjectUseCase, Inject, Injectable

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

### Community 217 - "PeriodeDistributionEntity"
Cohesion: 0.22
Nodes (8): PeriodeDistributionEntity, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn, InjectRepository

### Community 218 - "ADR — Migrations TypeORM retirées du pipeline de déploiement"
Cohesion: 0.33
Nodes (5): ADR — Migrations TypeORM retirées du pipeline de déploiement, Conséquences / dette assumée, Contexte, Décision, Sortie de dette (préalable à tout lancement)

### Community 219 - "EnregistrerDocumentClesUseCase"
Cohesion: 0.40
Nodes (3): EnregistrerDocumentClesUseCase, Inject, Injectable

### Community 235 - "ADR — Limitation de débit : fail-open par défaut, fail-closed ciblé"
Cohesion: 0.40
Nodes (4): ADR — Limitation de débit : fail-open par défaut, fail-closed ciblé, Conséquences assumées, Contexte, Décision

### Community 236 - "AddUniteLouableDto"
Cohesion: 0.25
Nodes (7): AddUniteLouableDto, ApiProperty, IsNumber, IsOptional, IsString, IsUUID, Min

### Community 237 - "EnableMfaUseCase"
Cohesion: 0.40
Nodes (3): EnableMfaUseCase, Inject, Injectable

### Community 238 - ".unsubscribe"
Cohesion: 0.40
Nodes (4): Body, HttpCode, Post, Throttle

### Community 243 - "DepotCleanupCronService"
Cohesion: 0.33
Nodes (4): DepotCleanupCronService, Cron, Injectable, InjectRepository

## Knowledge Gaps
- **634 isolated node(s):** `SEED_ENTITIES`, `SeedConfig`, `$schema`, `collection`, `sourceRoot` (+629 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **104 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ActiveUser` connect `ActiveUser` to `payout-methods.port.ts`, `user.entity.ts`, `WalletEntity`, `InvestisseurDistributionsController`, `.declarerVersement`, `formatEur`, `porteur.controller.ts`, `Wallet`, `avis.controller.ts`, `project.controller.ts`, `AdminComplianceController`, `InvestisseurFiscaliteController`, `authentication.controller.ts`, `KycEntity`, `reclamations.controller.ts`, `StatutDeclaration`, `admin-sorties.controller.ts`, `CreateBeneficiaireEffectifDto`, `hasPermission`, `AdminPlatformWalletController`, `yousign-webhook.controller.ts`, `ProjectController`, `ReconciliationService`, `investment.controller.ts`, `PaymentController`, `reservation.controller.ts`, `IamError`, `Document`, `AdminController`, `RequirePermission`, `CurrentUser`, `InvestmentController`, `SecondaryMarketController`, `StripeConnectService`, `PorteurController`, `.create`, `fiscalite.module.ts`, `AdminNewsController`, `AdminDistributionsController`, `NotificationController`, `profile.controller.ts`, `IfuGenerationService`, `AdminSettingsController`, `AuthenticationController`, `PayoutMethodsController`, `AdminEmailTemplatesController`, `ReclamationsController`, `AdminReservationsController`, `kyc-validated.guard.ts`, `.adminCancel`, `.generate`, `AdminRetraitsController`, `AdminInvestorsController`, `round2`, `calculate-distribution-periode.usecase.ts`, `.closeCollecte`, `CgpController`?**
  _High betweenness centrality (0.102) - this node is a cross-community bridge._
- **Why does `CurrentUser` connect `CurrentUser` to `payout-methods.port.ts`, `user.entity.ts`, `WalletEntity`, `InvestisseurDistributionsController`, `.declarerVersement`, `formatEur`, `porteur.controller.ts`, `Wallet`, `avis.controller.ts`, `project.controller.ts`, `AdminComplianceController`, `InvestisseurFiscaliteController`, `authentication.controller.ts`, `KycEntity`, `reclamations.controller.ts`, `StatutDeclaration`, `admin-sorties.controller.ts`, `CreateBeneficiaireEffectifDto`, `hasPermission`, `AdminPlatformWalletController`, `yousign-webhook.controller.ts`, `ProjectController`, `ReconciliationService`, `investment.controller.ts`, `PaymentController`, `reservation.controller.ts`, `Document`, `AdminController`, `ActiveUser`, `RequirePermission`, `InvestmentController`, `SecondaryMarketController`, `PorteurController`, `.create`, `fiscalite.module.ts`, `AdminNewsController`, `AdminDistributionsController`, `NotificationController`, `profile.controller.ts`, `IfuGenerationService`, `AdminSettingsController`, `AuthenticationController`, `PayoutMethodsController`, `AdminEmailTemplatesController`, `ReclamationsController`, `AdminReservationsController`, `.adminCancel`, `.generate`, `AdminRetraitsController`, `AdminInvestorsController`, `round2`, `calculate-distribution-periode.usecase.ts`, `.closeCollecte`, `CgpController`?**
  _High betweenness centrality (0.083) - this node is a cross-community bridge._
- **Why does `dependencies` connect `dependencies` to `@nestjs/platform-express`, `@nestjs/platform-socket.io`, `@nestjs/schedule`, `@nestjs/terminus`, `@nestjs/throttler`, `@nestjs/typeorm`, `@nestjs/websockets`, `nodemailer`, `@opentelemetry/api`, `@opentelemetry/auto-instrumentations-node`, `@opentelemetry/exporter-trace-otlp-http`, `@opentelemetry/resources`, `@opentelemetry/sdk-node`, `@opentelemetry/semantic-conventions`, `otplib`, `passport`, `passport-facebook`, `passport-google-oauth20`, `pdfkit`, `pg`, `pino`, `pino-http`, `prom-client`, `qrcode`, `reflect-metadata`, `rxjs`, `@sentry/node`, `socket.io`, `stripe`, `swagger-ui-express`, `twilio`, `typeorm`, `@types/pdfkit`, `package.json`, `email-template.service.ts`, `class-validator`, `bcrypt`, `cache-manager`, `class-transformer`, `cloudinary`, `helmet`, `ioredis`, `@keyv/redis`, `@nestjs/common`, `@nestjs/config`, `@nestjs/core`, `@nestjs/cqrs`, `@nestjs/jwt`, `@getbrevo/brevo`, `nestjs-pino`?**
  _High betweenness centrality (0.059) - this node is a cross-community bridge._
- **What connects `SEED_ENTITIES`, `SeedConfig`, `$schema` to the rest of the system?**
  _634 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `authentication.module.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.026334615040686758 - nodes in this community are weakly interconnected._
- **Should `UserRepository` be split into smaller, more focused modules?**
  _Cohesion score 0.030938697318007663 - nodes in this community are weakly interconnected._
- **Should `user.entity.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05183861082737487 - nodes in this community are weakly interconnected._