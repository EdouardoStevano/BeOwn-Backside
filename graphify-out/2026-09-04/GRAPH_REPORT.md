# Graph Report - BeOwn-Backside  (2026-09-03)

## Corpus Check
- 810 files · ~455,434 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 6413 nodes · 17982 edges · 336 communities (230 shown, 106 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 16 edges (avg confidence: 0.69)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `99977c43`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- authentication.module.ts
- authentication.controller.ts
- user.enum.ts
- ProjectEntity
- porteur.controller.ts
- TransactionEntity
- mfa.usecases.spec.ts
- buildUser
- DeleteAccountDto
- TotpSecretService
- SignatureEntity
- ProfilPPEntity
- user.entity.ts
- fici.ts
- WalletController
- project-kpi.service.ts
- avis.controller.ts
- ProjectStatus
- ReclamationsController
- oauth-redirect-cookie.ts
- wallet.controller.ts
- Bail
- PersonalDataExportService
- StatutDeclaration
- admin-sorties.controller.ts
- calculate-distribution-periode.usecase.ts
- CreateBeneficiaireEffectifDto
- DocumentController
- UniteLouableEntity
- retention-policy.ts
- NotificationService
- ProjectController
- User
- LoyerEncaisse
- ExecuteDistributionUseCase
- UserStatus
- investment.controller.ts
- PaymentController
- ContactController
- investor-classification.ts
- Document
- DistributionPart
- AdminController
- SeedService
- ActiveUser
- email-driver.provider.ts
- RequirePermission
- CurrentUser
- InvestmentController
- DocumentFiscal
- SecondaryMarketController
- formatEur
- PorteurController
- AdminLocativeController
- sms.module.ts
- InvestmentRepository
- ProfilPMEntity
- AdminNewsController
- payout-methods.port.ts
- locative-management-infrastructure.module.ts
- .confirmDepot
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
- UserEntity
- Reservation
- taux-defaut-publication.ts
- notification-unsubscribe.service.spec.ts
- CreateRetraitDto
- update-admin-settings.dto.ts
- connect-prefill.ts
- profile.controller.ts
- compilerOptions
- IfuGenerationService
- create-reservation.usecase.ts
- AdminSettingsController
- ApiOperation
- PayoutMethodsController
- HashingService
- Seed Service Amélioré
- AdminEmailTemplatesController
- TransactionalEmailNotifier
- MfaMethod
- UpdatePreferencesDto
- ProjectRepository
- SpvEntity
- AdminReservationsController
- BroadcastService
- .verser
- StripeIdentityServiceImpl
- .adminCancel
- scripts
- RgpdPurgeService
- YouSignService
- mfa.dto.ts
- .generate
- AdminRetraitsController
- OtpRecordStore
- notification-test.controller.ts
- EmailService
- AdminInvestorsController
- StripePaymentService
- .declarerVersement
- HealthController
- Checklist de mise en service — BeOwn
- Lot 1 — Foundations (KpiCalculator + statuts + migrations) Implementation Plan
- FiciDto
- jest
- AdminSecondaryMarketController
- ProjectLedgerService
- AuditLogController
- fiscalite.module.ts
- reclamations.controller.ts
- round2
- Runbook de lancement — BeOwn
- exclude
- CreateOrdreMarcheDto
- .closeCollecte
- CgpController
- manage-payout-methods.usecase.ts
- AdminRgpdController
- InMemoryPayoutMethodsAdapter
- broadcast.service.ts
- .acknowledge
- TemplatedEmailService
- Lot 2 — Investor + Project KPIs Implementation Plan
- Design — Indicateurs financiers crowdlending obligataire (KPIs BeOwn)
- probe-cache-redis.ts
- InvestisseurDistributionsController
- RedisThrottlerStorage
- CreateBailDto
- NotificationGateway
- dependencies
- payout-destination.resolver.ts
- Lot 3 — Admin KPIs, Crons & Marketing Implementation Plan
- ADR — Grand livre interne : crédit du wallet projet et invariant comptable
- ADR — Retrait par carte et versement instantané (Stripe Instant Payout)
- Environnement de test local — BeOwn
- Plan de Gestion Extinctive (Run-off) — BeOwn
- AdminComplianceController
- AdminSettingsEntity
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
- AdminRetraitsReapController
- document.controller.ts
- DeclarerVersementPorteurDto
- ADR — Le grand livre n'a que deux colonnes de portefeuille (suppression du doublon `wallet_source`)
- probe-instant-payout.ts
- email-template.service.ts
- 4. Stripe
- UpdateEcheanceDto
- IamError
- AdminTransactionsLitigesController
- package.json
- CancelReservationUseCase
- À la charge du fondateur
- 3. Variables d'environnement et secrets
- CreateTransactionDto
- 15. Contenu marketing à remplacer
- 4. Domain — `KpiCalculator` (cœur testable)
- 8. Statuts & crons
- MetricsPort
- nest-cli.json
- StripePayoutMethodsService
- AttribuerBonusParrainageService
- InvestisseurFiscaliteController
- reconciliation.service.ts
- PublicStatisticsService
- AdminReconciliationController
- 1. Carte du système
- 6. Base de données
- 7. CI/CD — Jenkins et déclenchement par GitHub
- README.md
- SetPepFlagDto
- AddUniteLouableDto
- safe-html.ts
- InitiateInvestmentDto
- PlatformFeesService
- HttpMetricsInterceptor
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
- InvestorInactivityCronService
- ADR — Migrations TypeORM retirées du pipeline de déploiement
- DistributionsCronService
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
- Public
- payout-methods.contract.spec.ts
- DepotCleanupCronService
- CreateReservationDto
- cache-manager
- class-transformer
- cloudinary
- CreateProjectUseCase
- globals
- helmet
- ioredis
- jest
- @keyv/redis
- @nestjs/common
- @nestjs/config
- @nestjs/core
- @nestjs/cqrs
- MetricsThrottlerGuard
- parrainage.controller.ts
- nestjs-pino
- @nestjs/platform-express
- @nestjs/platform-socket.io
- @nestjs/schedule
- @nestjs/terminus
- @nestjs/throttler
- @nestjs/typeorm
- @nestjs/websockets
- ContactDto
- RecaptchaService
- @opentelemetry/auto-instrumentations-node
- @opentelemetry/exporter-trace-otlp-http
- .sendLoginOtp
- @opentelemetry/sdk-node
- @opentelemetry/semantic-conventions
- otplib
- passport
- passport-facebook
- ListMfaMethodsUseCase
- pdfkit
- pg
- pino
- .unsubscribe
- prom-client
- qrcode
- AesGcmSecretCipherAdapter
- kyc-validated.endpoints.spec.ts
- DeclareChargeDto
- socket.io
- swagger-ui-express
- 5. Courriel et SMS
- PlatformFeesModule
- @types/pdfkit
- source-map-support
- ts-jest
- MetricsModule
- @getbrevo/brevo
- tsconfig-paths
- @types/express
- @types/jest
- @types/multer
- @nestjs/testing
- ProjectViewEntity
- ExchangeCodeDto
- @types/passport-google-oauth20
- ts-loader
- @types/twilio
- @types/bcrypt
- typescript
- assign-project-porteur.js
- set-user-role.js
- verify-test-user.js
- data-source.ts
- redirect-url.ts
- GetInvestisseurDistributionHistoryUseCase
- UpdateUserStatusDto
- update-project.usecase.ts
- payment.controller.apport-porteur.spec.ts
- SignInDto
- class-validator
- RejectDeclarationDto
- public.decorator.ts
- .constructor
- supertest
- @types/passport-linkedin-oauth2
- @nestjs/jwt
- @nestjs/passport
- nodemailer
- @opentelemetry/api
- @opentelemetry/resources
- passport-google-oauth20
- pino-http
- reflect-metadata
- rxjs
- @sentry/node
- stripe
- twilio
- typeorm
- @types/qrcode

## God Nodes (most connected - your core abstractions)
1. `ActiveUser` - 290 edges
2. `CurrentUser` - 249 edges
3. `UserEntity` - 177 edges
4. `ProjectEntity` - 127 edges
5. `InvestmentEntity` - 112 edges
6. `RequirePermission()` - 105 edges
7. `TransactionEntity` - 105 edges
8. `WalletEntity` - 103 edges
9. `formatEur()` - 99 edges
10. `MetricsPort` - 98 edges

## Surprising Connections (you probably didn't know these)
- `MouvementSeed` --references--> `TransactionStatus`  [EXTRACTED]
  database/seeds/seed-ledger.ts → src/wallets/domains/enums/wallet.enum.ts
- `UserData` --references--> `UserRole`  [EXTRACTED]
  database/seeds/seed.service.improved.ts → src/iam/domains/enums/user.enum.ts
- `SeedService` --references--> `UserEntity`  [EXTRACTED]
  database/seeds/seed.service.improved.ts → src/iam/infrastructure/persistence/entities/user.entity.ts
- `SeedService` --references--> `InvestmentEntity`  [EXTRACTED]
  database/seeds/seed.service.improved.ts → src/investments/infrastructure/persistences/entities/investment.entity.ts
- `SeedService` --references--> `ProjectEntity`  [EXTRACTED]
  database/seeds/seed.service.improved.ts → src/projects/infrastructure/persistences/entities/project.entity.ts

## Import Cycles
- None detected.

## Communities (336 total, 106 thin omitted)

### Community 0 - "authentication.module.ts"
Cohesion: 0.03
Nodes (82): AuthenticationModule, Module, OTP_RECORD_STORE, SECRET_CIPHER, SecretCipher, TOTP_GENERATOR, TotpGenerator, TotpUriParams (+74 more)

### Community 1 - "authentication.controller.ts"
Cohesion: 0.04
Nodes (64): AuthSession, AuthTokens, EmailTokenPayload, EmailTokenPurpose, NOTIF_UNSUBSCRIBE_TYPE, TokenPayload, UNSUBSCRIBE_TOKEN_AUDIENCE, UnsubscribeTokenPayload (+56 more)

### Community 2 - "user.enum.ts"
Cohesion: 0.08
Nodes (36): ADMIN_ROLES, MONTH_LABELS, ADMIN_ROLES, ADMIN_ROLES, ADMIN_ROLES, CancelCollecteDto, ADMIN_ROLES, REPORT_LABEL (+28 more)

### Community 3 - "ProjectEntity"
Cohesion: 0.05
Nodes (67): OneToMany, ADMIN_ROLES, MANAGE_ROLES, InjectRepository, InjectRepository, InjectRepository, GetAggregatedScheduleUseCase, round2() (+59 more)

### Community 4 - "porteur.controller.ts"
Cohesion: 0.09
Nodes (31): LocativeManagementModule, Module, BAIL_REPOSITORY, BailRepository, UNITE_LOUABLE_REPOSITORY, UniteLouableRepository, AddUniteLouableInput, AddUniteLouableUseCase (+23 more)

### Community 5 - "TransactionEntity"
Cohesion: 0.05
Nodes (71): ADMIN_ROLES, PLATFORM_FEE_SOURCES, CANONICAL_SOURCES, InjectRepository, InvestissementDefinitif, DELAI_ABANDON_DEPOT_JOURS, MOTIF_DEPOT_ABANDONNE, DELAI_ALERTE_SANS_PAYOUT_JOURS (+63 more)

### Community 6 - "mfa.usecases.spec.ts"
Cohesion: 0.06
Nodes (36): MFA_CHALLENGE_MAX_ATTEMPTS, MfaChallenge, MfaChallengeDraft, MfaChallengePurpose, key(), MFAChallengeCacheService, build(), draft (+28 more)

### Community 7 - "buildUser"
Cohesion: 0.13
Nodes (14): EventsHandler, build(), event, UserRegisteredEventHandler, makeUserRepository(), buildUser(), SendEmailVerificationUseCase, Injectable (+6 more)

### Community 8 - "DeleteAccountDto"
Cohesion: 0.67
Nodes (3): DeleteAccountDto, IsNotEmpty, IsString

### Community 9 - "TotpSecretService"
Cohesion: 0.15
Nodes (6): TotpSecretService, Inject, Injectable, TotpEnrollmentStrategy, Injectable, totpQrHtml()

### Community 10 - "SignatureEntity"
Cohesion: 0.04
Nodes (64): Module, YouSignModule, DocumentEntity, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn (+56 more)

### Community 11 - "ProfilPPEntity"
Cohesion: 0.11
Nodes (20): Inject, InjectRepository, ProfilPPEntity, Column, CreateDateColumn, Entity, JoinColumn, OneToOne (+12 more)

### Community 12 - "user.entity.ts"
Cohesion: 0.05
Nodes (75): AdminModule, Module, AppModule, Module, AvisModule, Module, AvisInfrastructureModule, Module (+67 more)

### Community 13 - "fici.ts"
Cohesion: 0.07
Nodes (44): ACTUALITES, ActualiteSeed, eur(), ficiComplet(), ficiPartiel(), ParametresFici, makeService(), ConsulterDocumentClesUseCase (+36 more)

### Community 14 - "WalletController"
Cohesion: 0.21
Nodes (12): ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags, Body, Controller, Get (+4 more)

### Community 15 - "project-kpi.service.ts"
Cohesion: 0.06
Nodes (44): InvestorKpiService, Injectable, GRAVITE_LIGNE, GRAVITE_SANTE, KpiCache, LIGNE_PAR_STATUT, ProjectKpiService, SANTE_PAR_STATUT (+36 more)

### Community 16 - "avis.controller.ts"
Cohesion: 0.07
Nodes (32): AVIS_REPOSITORY, AvisRepository, Avis, AvisRawRow, AvisTypeOrmRepository, StatsRawRow, Injectable, InjectRepository (+24 more)

### Community 17 - "ProjectStatus"
Cohesion: 0.19
Nodes (16): ProjectData, PROJECT_REPOSITORY, InMemoryProjectRepository, ALLOWED_TRANSITIONS, FICI_VALIDE, makeDeps(), makeProject(), Injectable (+8 more)

### Community 18 - "ReclamationsController"
Cohesion: 0.17
Nodes (14): ReclamationsController, ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags, Body, Controller (+6 more)

### Community 19 - "oauth-redirect-cookie.ts"
Cohesion: 0.06
Nodes (25): SocialProfile, Social, CookieOAuthStateStore, FacebookAuthStrategy, Injectable, GoogleStrategy, Injectable, LinkedinStrategy (+17 more)

### Community 20 - "wallet.controller.ts"
Cohesion: 0.15
Nodes (7): WALLET_REPOSITORY, WalletRepository, Transaction, Wallet, WalletMapper, Injectable, WalletTypeOrmRepository

### Community 21 - "Bail"
Cohesion: 0.12
Nodes (13): Bail, StatutBail, BailEntity, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn (+5 more)

### Community 22 - "PersonalDataExportService"
Cohesion: 0.12
Nodes (12): PersonalDataExportService, Injectable, PersonalDataController, ApiBearerAuth, ApiOperation, ApiResponse, ApiTags, Controller (+4 more)

### Community 23 - "StatutDeclaration"
Cohesion: 0.09
Nodes (23): CHARGE_REPOSITORY, ChargeRepository, DeclareChargeInput, DeclareChargeUseCase, Inject, Injectable, Inject, Injectable (+15 more)

### Community 24 - "admin-sorties.controller.ts"
Cohesion: 0.06
Nodes (42): SORTIE_PROJET_REPOSITORY, SortieProjetRepository, DeclareSortieInput, DeclareSortieUseCase, round2(), Inject, Injectable, ExecuteSortieResult (+34 more)

### Community 25 - "calculate-distribution-periode.usecase.ts"
Cohesion: 0.09
Nodes (23): PERIODE_DISTRIBUTION_REPOSITORY, PeriodeDistributionRepository, CalculateDistributionPeriodeUseCase, Inject, Injectable, ExecuteDistributionResult, Inject, Injectable (+15 more)

### Community 26 - "CreateBeneficiaireEffectifDto"
Cohesion: 0.10
Nodes (23): CreateBeneficiaireEffectifDto, ApiProperty, ApiPropertyOptional, IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString (+15 more)

### Community 27 - "DocumentController"
Cohesion: 0.14
Nodes (20): Redirect, DocumentController, ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiParam, ApiResponse (+12 more)

### Community 28 - "UniteLouableEntity"
Cohesion: 0.13
Nodes (12): UniteLouable, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn, UniteLouableEntity (+4 more)

### Community 29 - "retention-policy.ts"
Cohesion: 0.12
Nodes (22): AnonymizeAccountService, RAPPORT_VIDE(), RapportAnonymisation, Injectable, InjectDataSource, StockageFichiersPort, CompteurFinalite, InjectDataSource (+14 more)

### Community 30 - "NotificationService"
Cohesion: 0.04
Nodes (64): ADMIN_ROLES, CreateReservationAdminDto, TODO: branch on real e-signature provider (Yousign / DocuSign / Universign)., ADMIN_ROLES, InjectRepository, estIndisponibiliteFournisseur(), BLOCKING_INVESTMENT_STATUSES, DeletionBlocker (+56 more)

### Community 31 - "ProjectController"
Cohesion: 0.12
Nodes (23): ProjectReadModelService, Inject, Injectable, GetProjectsUseCase, Injectable, ProjectController, ApiBearerAuth, ApiBody (+15 more)

### Community 32 - "User"
Cohesion: 0.04
Nodes (12): RFC-5321, RFC-5322, InvalidEmailError, NO_MFA, PublicUserMfa, UserMapper, UserPreferences, User (+4 more)

### Community 33 - "LoyerEncaisse"
Cohesion: 0.08
Nodes (23): LOYER_ENCAISSE_REPOSITORY, LoyerEncaisseRepository, DeclareLoyerInput, EtatFinancierPeriode, GetProjectEtatFinancierUseCase, Inject, Injectable, Inject (+15 more)

### Community 34 - "ExecuteDistributionUseCase"
Cohesion: 0.43
Nodes (3): ExecuteDistributionUseCase, round2(), Injectable

### Community 35 - "UserStatus"
Cohesion: 0.12
Nodes (11): UserStatus, InvalidPersonNameError, PasswordComparator, RegisterUserProps, registerProps, UserState, FirstName, LastName (+3 more)

### Community 36 - "investment.controller.ts"
Cohesion: 0.10
Nodes (33): CancelInvestmentUseCase, Injectable, InjectDataSource, calculerEcheanceRetractation(), CODE_RETRACTATION_DEJA_EFFECTUEE, CODE_RETRACTATION_DELAI_EXPIRE, CODE_RETRACTATION_INTROUVABLE, CODE_RETRACTATION_NON_APPLICABLE (+25 more)

### Community 37 - "PaymentController"
Cohesion: 0.10
Nodes (8): ApiHeader, PaymentController, ApiBearerAuth, ApiTags, Controller, Headers, Req, SkipThrottle

### Community 38 - "ContactController"
Cohesion: 0.12
Nodes (13): ContactController, escapeHtml(), ApiOperation, ApiResponse, ApiTags, Body, Controller, HttpCode (+5 more)

### Community 39 - "investor-classification.ts"
Cohesion: 0.05
Nodes (57): InjectRepository, RiskScoringService, Cron, Injectable, InjectRepository, InjectRepository, appliquerTestConnaissances(), TestConnaissancesResponse (+49 more)

### Community 40 - "Document"
Cohesion: 0.12
Nodes (6): DocumentRepository, Document, DocumentTypeOrmRepository, Injectable, InjectRepository, InMemoryDocumentRepository

### Community 41 - "DistributionPart"
Cohesion: 0.09
Nodes (17): DISTRIBUTION_PART_REPOSITORY, DistributionPartRepository, CalculateDistributionResult, InvestisseurDistributionPart, InvestisseurDistributionSummary, DistributionPart, DistributionPartEntity, Column (+9 more)

### Community 42 - "AdminController"
Cohesion: 0.14
Nodes (19): ACTIVE_INVESTMENT_STATUSES, AdminController, ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse (+11 more)

### Community 44 - "ActiveUser"
Cohesion: 0.16
Nodes (17): ActiveUser, KYC_REVIEWER_ROLES, ProfileController, ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags (+9 more)

### Community 45 - "email-driver.provider.ts"
Cohesion: 0.12
Nodes (15): emailServiceProvider, MAIL_DRIVERS, MailDriver, REAL_SEND_ENVIRONMENTS, resolveMailDriver(), EmailModule, Global, Module (+7 more)

### Community 46 - "RequirePermission"
Cohesion: 0.20
Nodes (18): AdminEcheancesController, AdminEcheancesItemController, PAY_ROLES, ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags (+10 more)

### Community 47 - "CurrentUser"
Cohesion: 0.14
Nodes (20): CurrentUser, ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags, Body, Controller (+12 more)

### Community 48 - "InvestmentController"
Cohesion: 0.16
Nodes (19): Roles(), InvestmentController, ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags, Body (+11 more)

### Community 49 - "DocumentFiscal"
Cohesion: 0.14
Nodes (14): DOCUMENT_FISCAL_REPOSITORY, DocumentFiscalRepository, DocumentFiscal, DocumentFiscalEntity, Column, CreateDateColumn, Entity, Index (+6 more)

### Community 50 - "SecondaryMarketController"
Cohesion: 0.18
Nodes (16): SecondaryMarketController, ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags, Body, Controller (+8 more)

### Community 51 - "formatEur"
Cohesion: 0.04
Nodes (25): DeleteAccountUseCase, isUniqueViolation(), Inject, Injectable, InjectDataSource, InjectRepository, Inject, InjectRepository (+17 more)

### Community 52 - "PorteurController"
Cohesion: 0.17
Nodes (13): PorteurController, ApiBearerAuth, ApiOperation, ApiTags, Body, Controller, Get, Param (+5 more)

### Community 53 - "AdminLocativeController"
Cohesion: 0.23
Nodes (10): AdminLocativeController, ApiBearerAuth, ApiOperation, ApiTags, Body, Controller, Get, Param (+2 more)

### Community 54 - "sms.module.ts"
Cohesion: 0.12
Nodes (13): LogSmsService, Injectable, hasTwilioCredentials(), resolveSmsDriver(), SmsDriver, SmsModule, smsServiceFactory(), TWILIO_ENV (+5 more)

### Community 55 - "InvestmentRepository"
Cohesion: 0.05
Nodes (21): Inject, InjectRepository, InvestmentRepository, ReinvestirLoyersService, Injectable, InjectRepository, ContractData, CreateInvestmentUseCase (+13 more)

### Community 56 - "ProfilPMEntity"
Cohesion: 0.10
Nodes (20): BeneficiaireEffectifEntity, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn (+12 more)

### Community 57 - "AdminNewsController"
Cohesion: 0.12
Nodes (21): AdminNewsController, PublicNewsController, slugify(), ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiQuery (+13 more)

### Community 58 - "payout-methods.port.ts"
Cohesion: 0.23
Nodes (8): ADR-0003, PayoutMethodError, PayoutMethodErrorCode, PayoutMethodType, ADR-0002, HTTP_STATUS_BY_CODE, PayoutMethodExceptionFilter, Catch

### Community 59 - "locative-management-infrastructure.module.ts"
Cohesion: 0.14
Nodes (14): LOCATAIRE_REPOSITORY, LocataireRepository, Locataire, LocataireEntity, Column, CreateDateColumn, Entity, Index (+6 more)

### Community 60 - ".confirmDepot"
Cohesion: 0.22
Nodes (10): ApiOperation, ApiParam, ApiResponse, Body, Get, HttpCode, Param, Post (+2 more)

### Community 61 - "devDependencies"
Cohesion: 0.07
Nodes (29): eslint, eslint-config-prettier, @eslint/eslintrc, @eslint/js, eslint-plugin-prettier, @nestjs/cli, @nestjs/schematics, devDependencies (+21 more)

### Community 62 - "PrometheusMetricsAdapter"
Cohesion: 0.12
Nodes (11): Header, MetricName, MetricsController, ApiExcludeController, Controller, Get, Headers, Res (+3 more)

### Community 63 - ".ecrire"
Cohesion: 0.16
Nodes (15): Put, AdminDocumentClesController, DocumentClesController, gabarit(), ApiBearerAuth, ApiBody, ApiOperation, ApiParam (+7 more)

### Community 64 - "AdminExportsController"
Cohesion: 0.14
Nodes (18): RFC-4180, AdminExportsController, ROLES_EXPORT, ADMIN, build(), fakeQueryBuilder(), ApiBearerAuth, ApiOperation (+10 more)

### Community 65 - "GetPorteurTresorerieUseCase"
Cohesion: 0.09
Nodes (19): GetPorteurTresorerieUseCase, Injectable, TresoreriePaginationDto, ApiPropertyOptional, IsInt, IsOptional, Max, Min (+11 more)

### Community 66 - "tableau-affichage.ts"
Cohesion: 0.09
Nodes (27): arrondi2(), BaseCalculFraisCession, calculerAssietteCession(), CODE_ANNONCE_EXPIREE, CODE_DETENTION_TROP_RECENTE, CODE_PROJET_NON_ELIGIBLE, dateCessibiliteMinimale(), DemandeMiseEnVente (+19 more)

### Community 67 - "CLAUDE.md"
Cohesion: 0.08
Nodes (25): 10. Conventions de nommage, 11. Stratégie de tests (alignée sur les couches), 12. ❌ Interdictions strictes, 13. ✅ Checklist avant de générer du code, 14. Exemple de flux complet — "Créer une commande", 15. Commandes utiles (exemple générique — à adapter au `package.json` réel), 16. Pour aller plus loin, 1. La règle d'or : direction des dépendances (+17 more)

### Community 68 - "AdminDistributionsController"
Cohesion: 0.16
Nodes (14): CalculateDistributionDto, ApiProperty, IsUUID, Matches, AdminDistributionsController, ApiBearerAuth, ApiOperation, ApiTags (+6 more)

### Community 69 - "NotificationController"
Cohesion: 0.14
Nodes (13): NotificationController, ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags, Controller, Delete (+5 more)

### Community 70 - "CreateProjectDto"
Cohesion: 0.13
Nodes (25): IsLatitude, IsLongitude, IsUrl, CreateProjectDto, CreateSpvDto, EtapeChronologieDto, GarantieDto, toNumber() (+17 more)

### Community 71 - "UserEntity"
Cohesion: 0.03
Nodes (87): Check, bootstrap(), SEED_ENTITIES, SeedModule, Module, runMigrations(), CompteInvestisseur, SeedConfig (+79 more)

### Community 72 - "Reservation"
Cohesion: 0.14
Nodes (5): ReservationRepository, Reservation, ReservationMapper, ReservationTypeOrmRepository, Injectable

### Community 73 - "taux-defaut-publication.ts"
Cohesion: 0.12
Nodes (18): agreger(), arrondir(), CohorteAnnuelle, construirePublication(), debutPeriodePublication(), METHODOLOGIE_TAUX_DEFAUT, pourcent(), PROFONDEUR_PUBLICATION_MOIS (+10 more)

### Community 74 - "notification-unsubscribe.service.spec.ts"
Cohesion: 0.07
Nodes (24): Inject, NotificationUnsubscribeService, buildSignerConfig(), buildTokenService(), buildTtlConfig(), Injectable, PublicUnsubscribeController, ApiOperation (+16 more)

### Community 75 - "CreateRetraitDto"
Cohesion: 0.23
Nodes (20): AttachPayoutMethodDto, ConfirmDepotDto, ConnectOnboardingDto, CreateApportPorteurDto, CreatePaymentIntentDto, CreateRetraitDto, StartKycVerificationDto, ApiProperty (+12 more)

### Community 76 - "update-admin-settings.dto.ts"
Cohesion: 0.18
Nodes (20): BroadcastChannelTogglesDto, BroadcastSettingsDto, CommissionsSettingsDto, FeatureFlagsSettingsDto, NotificationsSettingsDto, PlatformSettingsDto, ApiPropertyOptional, IsBoolean (+12 more)

### Community 77 - "connect-prefill.ts"
Cohesion: 0.09
Nodes (18): InvestorIdentity, InvestorIdentityReader, KycDocumentFace, KycDocumentSource, KycIdentityDocument, buildIndividualPrefill(), clean(), cleanCountry() (+10 more)

### Community 78 - "profile.controller.ts"
Cohesion: 0.04
Nodes (56): PROFIL_REPOSITORY, ProfilRepository, CreateKycUseCase, Inject, Injectable, CreateProfilPMUseCase, Inject, Injectable (+48 more)

### Community 79 - "compilerOptions"
Cohesion: 0.09
Nodes (22): compilerOptions, allowSyntheticDefaultImports, baseUrl, declaration, emitDecoratorMetadata, esModuleInterop, experimentalDecorators, forceConsistentCasingInFileNames (+14 more)

### Community 80 - "IfuGenerationService"
Cohesion: 0.11
Nodes (14): AdminFiscalController, ApiBearerAuth, ApiOperation, ApiParam, ApiTags, Controller, HttpCode, InjectRepository (+6 more)

### Community 81 - "create-reservation.usecase.ts"
Cohesion: 0.37
Nodes (5): RESERVATION_REPOSITORY, TODO: Store motif when reservation domain model is updated, ReservationStatus, ReservationsInfrastructureModule, Module

### Community 82 - "AdminSettingsController"
Cohesion: 0.14
Nodes (13): AdminSettingsController, ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags, Body, Controller (+5 more)

### Community 83 - "ApiOperation"
Cohesion: 0.34
Nodes (8): Ip, ApiBearerAuth, ApiOperation, ApiResponse, Body, HttpCode, Post, Throttle

### Community 84 - "PayoutMethodsController"
Cohesion: 0.14
Nodes (16): PayoutMethodsController, ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags, Body, Controller (+8 more)

### Community 85 - "HashingService"
Cohesion: 0.15
Nodes (9): BcryptService, Injectable, HASHING_SERVICE, HashingService, Inject, CreateUserProps, Inject, Injectable (+1 more)

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
Cohesion: 0.27
Nodes (14): PreferenceBooleanDto, PreferenceLangueDto, SetUserTypeDto, ApiProperty, ApiPropertyOptional, IsBoolean, IsIn, IsOptional (+6 more)

### Community 91 - "ProjectRepository"
Cohesion: 0.09
Nodes (11): ProjectRepository, Inject, Inject, Inject, Inject, InMemoryProjectRepository, Project, Garantie (+3 more)

### Community 92 - "SpvEntity"
Cohesion: 0.20
Nodes (11): RegimeFiscal, Spv, SpvEntity, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn (+3 more)

### Community 93 - "AdminReservationsController"
Cohesion: 0.21
Nodes (13): AdminReservationsController, mapStatus(), ApiBearerAuth, ApiOperation, ApiTags, Body, Controller, Get (+5 more)

### Community 94 - "BroadcastService"
Cohesion: 0.20
Nodes (3): BroadcastChannelToggles, BroadcastService, Injectable

### Community 95 - ".verser"
Cohesion: 0.09
Nodes (21): ApiPropertyOptional, IsNotEmpty, IsOptional, IsPositive, IsString, Max, VerserPorteurStripeDto, AdminVersementPorteurController (+13 more)

### Community 96 - "StripeIdentityServiceImpl"
Cohesion: 0.11
Nodes (7): KycImageUrls, KycReportData, STRIPE_IDENTITY_SERVICE, StripeIdentityService, StripeIdentityServiceImpl, Injectable, VerificationSessionResult

### Community 97 - ".adminCancel"
Cohesion: 0.21
Nodes (14): ReservationController, ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags, Body, Controller (+6 more)

### Community 98 - "scripts"
Cohesion: 0.11
Nodes (19): scripts, build, format, lint, migration:drop, migration:generate, migration:revert, migration:run (+11 more)

### Community 99 - "RgpdPurgeService"
Cohesion: 0.21
Nodes (7): RgpdPurgeCronService, Cron, Injectable, lignesAffectees(), RgpdPurgeService, Injectable, seuilPurge()

### Community 100 - "YouSignService"
Cohesion: 0.06
Nodes (27): motifIndisponibilite, SIGNATURE_PROVIDER_UNAVAILABLE, SignatureProviderUnavailableError, DELAI_AVANT_NOUVELLE_TENTATIVE_S, MESSAGE_SIGNATURE_INDISPONIBLE, SignatureProviderExceptionFilter, Catch, Injectable (+19 more)

### Community 101 - "mfa.dto.ts"
Cohesion: 0.22
Nodes (18): DisableMfaDto, EnableMfaDto, EnrollMfaDto, MfaChallengeDto, MfaChallengeIssuedDto, MfaEnrollmentChallengeDto, MfaMethodResponseDto, MfaMethodSummaryDto (+10 more)

### Community 102 - ".generate"
Cohesion: 0.18
Nodes (13): AdminReportsController, EXPORT_ROLES, REPORT_TYPES, ApiBearerAuth, ApiOperation, ApiResponse, ApiTags, Controller (+5 more)

### Community 103 - "AdminRetraitsController"
Cohesion: 0.13
Nodes (15): AdminRetraitsController, STATUTS, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags (+7 more)

### Community 104 - "OtpRecordStore"
Cohesion: 0.13
Nodes (10): OtpRecord, OtpRecordStore, readPositiveInt(), build(), makeStore(), Inject, TooManyOtpAttemptsError, CacheOtpRecordStoreAdapter (+2 more)

### Community 105 - "notification-test.controller.ts"
Cohesion: 0.14
Nodes (16): NotificationTestController, ApiOperation, ApiResponse, ApiTags, Body, Controller, HttpCode, Inject (+8 more)

### Community 106 - "EmailService"
Cohesion: 0.11
Nodes (4): Inject, InjectRepository, Inject, EmailService

### Community 107 - "AdminInvestorsController"
Cohesion: 0.16
Nodes (11): AdminInvestorsController, ROLE_ASSIGN_ROLES, ApiBearerAuth, ApiOperation, ApiTags, Body, Controller, Get (+3 more)

### Community 108 - "StripePaymentService"
Cohesion: 0.12
Nodes (8): CreatePaymentIntentParams, PAYMENT_SERVICE, PaymentIntentResult, PaymentService, StripePaymentService, Injectable, StripePlateformeBalanceAdapter, Injectable

### Community 109 - ".declarerVersement"
Cohesion: 0.14
Nodes (15): AdminProjectFinanceController, ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags, Body, Controller (+7 more)

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

### Community 115 - "AdminSecondaryMarketController"
Cohesion: 0.17
Nodes (13): AdminSecondaryMarketController, ApiBearerAuth, ApiOperation, ApiQuery, ApiTags, Controller, Get, HttpCode (+5 more)

### Community 116 - "ProjectLedgerService"
Cohesion: 0.20
Nodes (9): ProjectLedgerService, Injectable, InjectDataSource, VersementDeclare, AgregatsLedgerProjet, calculerEtatFinancierProjet(), EtatFinancierProjet, etatFinancierSansMouvement() (+1 more)

### Community 117 - "AuditLogController"
Cohesion: 0.13
Nodes (12): describeAuditAction(), OBJET, SUFFIXES, VERBE, AuditLogController, ApiBearerAuth, ApiOperation, ApiQuery (+4 more)

### Community 118 - "fiscalite.module.ts"
Cohesion: 0.08
Nodes (26): DistributionsInfrastructureModule, Module, FiscaliteModule, Module, IfuCronService, Cron, Inject, Injectable (+18 more)

### Community 119 - "reclamations.controller.ts"
Cohesion: 0.06
Nodes (43): EffetMouvement, round2(), SeedService, Injectable, PermissionsGuard, Injectable, allows(), contextFor() (+35 more)

### Community 120 - "round2"
Cohesion: 0.17
Nodes (7): round2(), ApiOperation, Get, round2(), round2(), AcquisitionSource, computeCoutAcquisition()

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
Cohesion: 0.20
Nodes (10): CgpController, ApiBearerAuth, ApiOperation, ApiTags, Controller, Get, InjectRepository, Param (+2 more)

### Community 126 - "manage-payout-methods.usecase.ts"
Cohesion: 0.30
Nodes (5): ConnectAccountReader, ConnectAccountStatus, PayoutMethodsWriter, ManagePayoutMethodsUseCase, Injectable

### Community 127 - "AdminRgpdController"
Cohesion: 0.13
Nodes (13): RapportPurgeRgpd, AdminRgpdController, RGPD_PURGE_ROLES, ApiBearerAuth, ApiOperation, ApiResponse, ApiTags, Controller (+5 more)

### Community 128 - "InMemoryPayoutMethodsAdapter"
Cohesion: 0.18
Nodes (5): InstantBalanceView, PayoutMethodView, InMemoryPayoutMethodsAdapter, Injectable, ADR-0002

### Community 129 - "broadcast.service.ts"
Cohesion: 0.13
Nodes (15): BroadcastSettings, mergeBroadcastSettings(), BROADCAST_PREF_DEFAULTS, BroadcastEvent, BroadcastResult, BroadcastStats, CampaignConfig, CAMPAIGNS (+7 more)

### Community 130 - ".acknowledge"
Cohesion: 0.16
Nodes (14): SignaturesController, ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags, Controller, Get (+6 more)

### Community 131 - "TemplatedEmailService"
Cohesion: 0.15
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

### Community 138 - "NotificationGateway"
Cohesion: 0.12
Nodes (9): ConnectedSocket, MessageBody, NotificationGateway, originesAutorisees(), jwt, verifierOrigine(), SubscribeMessage, WebSocketGateway (+1 more)

### Community 139 - "dependencies"
Cohesion: 0.15
Nodes (13): bcrypt, @nestjs/cache-manager, @nestjs/event-emitter, @nestjs/mapped-types, @nestjs/swagger, dependencies, bcrypt, @nestjs/cache-manager (+5 more)

### Community 140 - "payout-destination.resolver.ts"
Cohesion: 0.23
Nodes (10): PayoutMethodKind, PayoutMethodsReader, PayoutDestinationResolver, ResolvedPayoutDestination, ResolvePayoutDestinationInput, Injectable, INSTANT_PAYOUT_MAX_EUR, INSTANT_PAYOUT_MIN_EUR (+2 more)

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
Cohesion: 0.15
Nodes (11): AdminComplianceController, ApiBearerAuth, ApiOperation, ApiTags, Body, Controller, Get, InjectRepository (+3 more)

### Community 147 - "AdminSettingsEntity"
Cohesion: 0.09
Nodes (18): AdminSettingsEntity, BroadcastSettingsPatch, DEFAULT_BROADCAST_SETTINGS, Column, Entity, PrimaryColumn, UpdateDateColumn, InjectRepository (+10 more)

### Community 148 - "SignUpDto"
Cohesion: 0.21
Nodes (14): ForgotPasswordDto, ResetPasswordDto, SignUpDto, ApiProperty, ApiPropertyOptional, IsBoolean, IsEmail, IsNotEmpty (+6 more)

### Community 149 - "project-timeline-cron.service.ts"
Cohesion: 0.21
Nodes (6): computeChronologieStatuts(), ProjectTimelineCronService, Cron, Injectable, InjectRepository, EtapeChronologie

### Community 150 - "ReservationEntity"
Cohesion: 0.15
Nodes (11): InjectRepository, ReservationEntity, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne (+3 more)

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

### Community 160 - "document.controller.ts"
Cohesion: 0.14
Nodes (19): DOCUMENT_REPOSITORY, DocumentRelatedTo, DocumentType, parseBooleanish(), SetOrdreDto, toStrictBoolean(), ApiProperty, ApiPropertyOptional (+11 more)

### Community 161 - "DeclarerVersementPorteurDto"
Cohesion: 0.16
Nodes (15): DeclarerVersementPorteurDto, ListerEtatsFinanciersDto, ApiProperty, ApiPropertyOptional, IsDateString, IsInt, IsNotEmpty, IsNumber (+7 more)

### Community 162 - "ADR — Le grand livre n'a que deux colonnes de portefeuille (suppression du doublon `wallet_source`)"
Cohesion: 0.22
Nodes (8): ADR — Le grand livre n'a que deux colonnes de portefeuille (suppression du doublon `wallet_source`), Conséquence sur le schéma — PAS de `migration:run`, Contexte — trois colonnes de portefeuille pour deux rôles, Dette assumée, Décision 1 — Deux colonnes, et deux seulement, Décision 2 — Le sens de chaque écriture est fixé par type, Décision 3 — Le rapprochement devient une primitive du domaine, Rattrapage des données existantes

### Community 163 - "probe-instant-payout.ts"
Cohesion: 0.39
Nodes (8): cleanup(), describeExternalAccount(), fail(), KEEP, main(), SKIP_TRANSFER, stripe, title()

### Community 164 - "email-template.service.ts"
Cohesion: 0.10
Nodes (24): handlebars, handlebars, DEFAULT_TEMPLATE_META, EmailTemplateService, extractCorps(), extractTitle(), extractVariables(), INLINE_EXEMPT_CLASSES (+16 more)

### Community 165 - "4. Stripe"
Cohesion: 0.25
Nodes (8): 4.1 Faire valider l'activité par Stripe — avant tout le reste, 4.2 Activer le compte plateforme, 4.3 Passer en clés live, 4.4 Déclarer les webhooks, 4.5 Onboarding Stripe Connect, de bout en bout, au moins une fois, 4.6 Cartes de débit externes — état réel, 4.7 Rotation et stockage des clés, 4. Stripe

### Community 166 - "UpdateEcheanceDto"
Cohesion: 0.36
Nodes (8): InitializeScheduleDto, IsDateString, IsEnum, IsNumber, IsOptional, Min, UpdateAggregatedEcheanceDto, UpdateEcheanceDto

### Community 167 - "IamError"
Cohesion: 0.04
Nodes (49): AccountStatusGuard, expectRejection(), Injectable, InjectRepository, asUniqueViolation(), isEmailUniqueViolation(), POSTGRES_UNIQUE_VIOLATION, readCode() (+41 more)

### Community 168 - "AdminTransactionsLitigesController"
Cohesion: 0.18
Nodes (9): AdminTransactionsLitigesController, ROLES_LITIGES, ApiBearerAuth, ApiOperation, ApiTags, Controller, Get, InjectRepository (+1 more)

### Community 169 - "package.json"
Cohesion: 0.29
Nodes (6): author, description, license, name, private, version

### Community 170 - "CancelReservationUseCase"
Cohesion: 0.18
Nodes (7): CancelReservationUseCase, Inject, Injectable, CreateReservationUseCase, Inject, Injectable, Inject

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

### Community 177 - "MetricsPort"
Cohesion: 0.06
Nodes (33): InjectRepository, AML_THRESHOLD_MONTHLY, AML_THRESHOLD_SINGLE, AmlContext, AmlMonitorService, Inject, Injectable, InjectRepository (+25 more)

### Community 178 - "nest-cli.json"
Cohesion: 0.33
Nodes (5): collection, compilerOptions, deleteOutDir, $schema, sourceRoot

### Community 180 - "AttribuerBonusParrainageService"
Cohesion: 0.06
Nodes (27): ConfirmRetractationCronService, Cron, Injectable, InjectDataSource, AttribuerBonusParrainageService, build(), fauxQueryBuilderLecture(), fauxQueryBuilderUpdate() (+19 more)

### Community 181 - "InvestisseurFiscaliteController"
Cohesion: 0.20
Nodes (9): InvestisseurFiscaliteController, ApiBearerAuth, ApiOperation, ApiTags, Controller, Get, Param, Res (+1 more)

### Community 182 - "reconciliation.service.ts"
Cohesion: 0.07
Nodes (27): LivreSeed, MouvementSeed, PositionMutable, round2(), PlateformeBalanceReader, SoldePlateforme, ReconciliationCronService, Cron (+19 more)

### Community 183 - "PublicStatisticsService"
Cohesion: 0.15
Nodes (10): PublicStatistics, PublicStatisticsService, Injectable, InjectDataSource, PublicStatisticsController, ApiOperation, ApiResponse, ApiTags (+2 more)

### Community 184 - "AdminReconciliationController"
Cohesion: 0.15
Nodes (11): AdminReconciliationController, ApiBearerAuth, ApiOperation, ApiResponse, ApiTags, Controller, HttpCode, InjectRepository (+3 more)

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

### Community 190 - "AddUniteLouableDto"
Cohesion: 0.25
Nodes (7): AddUniteLouableDto, ApiProperty, IsNumber, IsOptional, IsString, IsUUID, Min

### Community 191 - "safe-html.ts"
Cohesion: 0.15
Nodes (21): ArrayMaxSize, ALLOWED_TAGS, analyzeHtml(), decodeEntities(), GLOBAL_ATTRS, IsSafeHtml, isSafeUrl(), SAFE_URL_PREFIXES (+13 more)

### Community 192 - "InitiateInvestmentDto"
Cohesion: 0.40
Nodes (5): InitiateInvestmentDto, ApiProperty, IsInt, IsPositive, IsUUID

### Community 193 - "PlatformFeesService"
Cohesion: 0.19
Nodes (11): DEFAULT_FEE_RATES, PlatformFeeRates, PlatformFeesService, Injectable, PublicFeesController, ApiTags, Controller, arrondi2() (+3 more)

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

### Community 217 - "InvestorInactivityCronService"
Cohesion: 0.50
Nodes (3): InvestorInactivityCronService, Cron, Injectable

### Community 218 - "ADR — Migrations TypeORM retirées du pipeline de déploiement"
Cohesion: 0.29
Nodes (6): ADR — Migrations TypeORM retirées du pipeline de déploiement, Conséquences / dette assumée, Contexte, Décision, Sortie de dette (préalable à tout lancement), Évolutions de schéma en attente de la sortie de dette

### Community 219 - "DistributionsCronService"
Cohesion: 0.33
Nodes (4): DistributionsCronService, Cron, Inject, Injectable

### Community 235 - "ADR — Limitation de débit : fail-open par défaut, fail-closed ciblé"
Cohesion: 0.40
Nodes (4): ADR — Limitation de débit : fail-open par défaut, fail-closed ciblé, Conséquences assumées, Contexte, Décision

### Community 236 - "Public"
Cohesion: 0.25
Nodes (10): Public(), AuthenticationController, ApiTags, Controller, Get, Query, Req, Res (+2 more)

### Community 237 - "payout-methods.contract.spec.ts"
Cohesion: 0.29
Nodes (5): Harness, makeFakeStripe(), makeInMemoryHarness(), makeStripeHarness(), stripeError()

### Community 238 - "DepotCleanupCronService"
Cohesion: 0.33
Nodes (4): DepotCleanupCronService, Cron, Injectable, InjectRepository

### Community 239 - "CreateReservationDto"
Cohesion: 0.25
Nodes (8): CancelReservationDto, CreateReservationDto, ApiProperty, IsNotEmpty, IsNumber, IsPositive, IsString, IsUUID

### Community 243 - "CreateProjectUseCase"
Cohesion: 0.38
Nodes (3): CreateProjectUseCase, Inject, Injectable

### Community 253 - "MetricsThrottlerGuard"
Cohesion: 0.33
Nodes (4): InjectThrottlerOptions, InjectThrottlerStorage, MetricsThrottlerGuard, Injectable

### Community 254 - "parrainage.controller.ts"
Cohesion: 0.09
Nodes (20): Inject, AssurerCodeParrainageService, Injectable, InjectRepository, RattacherFilleulService, Injectable, InjectRepository, StatutAttributionParrainage (+12 more)

### Community 263 - "ContactDto"
Cohesion: 0.33
Nodes (6): ContactDto, IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength

### Community 264 - "RecaptchaService"
Cohesion: 0.33
Nodes (3): RecaptchaResponse, RecaptchaService, Injectable

### Community 273 - "ListMfaMethodsUseCase"
Cohesion: 0.40
Nodes (3): ListMfaMethodsUseCase, Inject, Injectable

### Community 277 - ".unsubscribe"
Cohesion: 0.40
Nodes (4): Body, HttpCode, Post, Throttle

### Community 281 - "kyc-validated.endpoints.spec.ts"
Cohesion: 0.67
Nodes (3): ControllerClass, guardsOf(), hasKycGuard()

### Community 282 - "DeclareChargeDto"
Cohesion: 0.18
Nodes (11): DeclareChargeDto, ApiProperty, ArrayMinSize, IsArray, IsDateString, IsEnum, IsNumber, IsString (+3 more)

### Community 286 - "5. Courriel et SMS"
Cohesion: 0.50
Nodes (4): 5.1 Choisir le transport, 5.2 Configurer le SMTP, 5.3 SMS, 5. Courriel et SMS

### Community 287 - "PlatformFeesModule"
Cohesion: 0.67
Nodes (3): PlatformFeesModule, Global, Module

### Community 291 - "MetricsModule"
Cohesion: 0.67
Nodes (3): MetricsModule, Global, Module

### Community 298 - "ProjectViewEntity"
Cohesion: 0.29
Nodes (6): ProjectViewEntity, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn

### Community 299 - "ExchangeCodeDto"
Cohesion: 0.40
Nodes (5): ExchangeCodeDto, RefreshTokenDto, ApiProperty, IsNotEmpty, IsUUID

### Community 309 - "redirect-url.ts"
Cohesion: 0.57
Nodes (5): estRedirectionAutorisee(), normaliserOrigine(), resoudreUrlRedirection(), SCHEMAS_AUTORISES, ALLOWLIST

### Community 311 - "GetInvestisseurDistributionHistoryUseCase"
Cohesion: 0.40
Nodes (3): GetInvestisseurDistributionHistoryUseCase, Inject, Injectable

### Community 312 - "UpdateUserStatusDto"
Cohesion: 0.29
Nodes (7): ApiProperty, ApiPropertyOptional, IsEnum, IsOptional, IsString, MaxLength, UpdateUserStatusDto

### Community 313 - "update-project.usecase.ts"
Cohesion: 0.19
Nodes (12): Inject, Injectable, UpdateProjectDto, UpdateProjectUseCase, arrondir(), debutFenetreGlissante(), FENETRE_GLISSANTE_MOIS, OffrePorteur (+4 more)

### Community 314 - "payment.controller.apport-porteur.spec.ts"
Cohesion: 0.40
Nodes (3): AUTRE_PORTEUR, DTO, PORTEUR

### Community 316 - "SignInDto"
Cohesion: 0.33
Nodes (5): SignInDto, ApiProperty, IsEmail, IsNotEmpty, MinLength

### Community 318 - "RejectDeclarationDto"
Cohesion: 0.40
Nodes (4): RejectDeclarationDto, ApiProperty, IsNotEmpty, IsString

### Community 321 - "public.decorator.ts"
Cohesion: 0.29
Nodes (4): IS_PUBLIC_KEY, ROLES_KEY, RolesGuard, Injectable

## Knowledge Gaps
- **689 isolated node(s):** `ParametresFici`, `ActualiteSeed`, `PositionMutable`, `SEED_ENTITIES`, `SeedConfig` (+684 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **106 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ActiveUser` connect `ActiveUser` to `authentication.controller.ts`, `user.enum.ts`, `ProjectEntity`, `porteur.controller.ts`, `TransactionEntity`, `.acknowledge`, `InvestisseurDistributionsController`, `user.entity.ts`, `WalletController`, `avis.controller.ts`, `ProjectStatus`, `AdminComplianceController`, `ReclamationsController`, `wallet.controller.ts`, `PersonalDataExportService`, `StatutDeclaration`, `admin-sorties.controller.ts`, `admin-email-templates.controller.ts`, `calculate-distribution-periode.usecase.ts`, `DocumentController`, `CreateBeneficiaireEffectifDto`, `AdminPlatformWalletController`, `NotificationService`, `AdminRetraitsReapController`, `document.controller.ts`, `ProjectController`, `investment.controller.ts`, `PaymentController`, `IamError`, `AdminTransactionsLitigesController`, `AdminController`, `RequirePermission`, `CurrentUser`, `InvestmentController`, `MetricsPort`, `SecondaryMarketController`, `formatEur`, `PorteurController`, `InvestisseurFiscaliteController`, `AdminLocativeController`, `ProfilPMEntity`, `AdminNewsController`, `payout-methods.port.ts`, `AdminReconciliationController`, `.confirmDepot`, `AdminExportsController`, `GetPorteurTresorerieUseCase`, `AdminDistributionsController`, `NotificationController`, `UserEntity`, `profile.controller.ts`, `IfuGenerationService`, `AdminSettingsController`, `ApiOperation`, `PayoutMethodsController`, `AdminEmailTemplatesController`, `AdminReservationsController`, `.verser`, `.adminCancel`, `.generate`, `AdminRetraitsController`, `AdminInvestorsController`, `Public`, `.declarerVersement`, `AdminSecondaryMarketController`, `fiscalite.module.ts`, `reclamations.controller.ts`, `.closeCollecte`, `CgpController`, `parrainage.controller.ts`, `AdminRgpdController`?**
  _High betweenness centrality (0.086) - this node is a cross-community bridge._
- **Why does `dependencies` connect `dependencies` to `@nestjs/platform-express`, `@nestjs/platform-socket.io`, `@nestjs/schedule`, `@nestjs/terminus`, `@nestjs/throttler`, `@nestjs/typeorm`, `@nestjs/websockets`, `@opentelemetry/auto-instrumentations-node`, `@opentelemetry/exporter-trace-otlp-http`, `@opentelemetry/sdk-node`, `@opentelemetry/semantic-conventions`, `otplib`, `passport`, `passport-facebook`, `pdfkit`, `pg`, `pino`, `prom-client`, `qrcode`, `socket.io`, `swagger-ui-express`, `@types/pdfkit`, `@getbrevo/brevo`, `email-template.service.ts`, `package.json`, `class-validator`, `@nestjs/jwt`, `@nestjs/passport`, `nodemailer`, `@opentelemetry/api`, `@opentelemetry/resources`, `passport-google-oauth20`, `pino-http`, `reflect-metadata`, `rxjs`, `@sentry/node`, `stripe`, `twilio`, `typeorm`, `cache-manager`, `class-transformer`, `cloudinary`, `helmet`, `ioredis`, `@keyv/redis`, `@nestjs/common`, `@nestjs/config`, `@nestjs/core`, `@nestjs/cqrs`, `nestjs-pino`?**
  _High betweenness centrality (0.075) - this node is a cross-community bridge._
- **Why does `UserEntity` connect `UserEntity` to `authentication.module.ts`, `broadcast.service.ts`, `user.enum.ts`, `ProjectEntity`, `TransactionEntity`, `SignatureEntity`, `ProfilPPEntity`, `user.entity.ts`, `project-kpi.service.ts`, `AdminComplianceController`, `ReservationEntity`, `admin-email-templates.controller.ts`, `NotificationService`, `UserStatus`, `PaymentController`, `investor-classification.ts`, `AdminTransactionsLitigesController`, `IamError`, `AdminController`, `SeedService`, `MetricsPort`, `formatEur`, `ProfilPMEntity`, `AdminNewsController`, `AdminReconciliationController`, `connect-prefill.ts`, `profile.controller.ts`, `IfuGenerationService`, `create-reservation.usecase.ts`, `AdminSettingsController`, `MfaMethod`, `.verser`, `AdminRetraitsController`, `EmailService`, `.declarerVersement`, `reclamations.controller.ts`, `.closeCollecte`, `CgpController`, `parrainage.controller.ts`, `AdminRgpdController`?**
  _High betweenness centrality (0.074) - this node is a cross-community bridge._
- **What connects `ParametresFici`, `ActualiteSeed`, `PositionMutable` to the rest of the system?**
  _689 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `authentication.module.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.028929188255613126 - nodes in this community are weakly interconnected._
- **Should `authentication.controller.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.03523854511100614 - nodes in this community are weakly interconnected._
- **Should `user.enum.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07659850697825381 - nodes in this community are weakly interconnected._