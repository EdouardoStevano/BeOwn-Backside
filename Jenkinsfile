// ─────────────────────────────────────────────────────────────────────────────
// Jenkins CI/CD — BeOwn Backend
//
// Jenkins tourne dans Docker sur le serveur Linux/Debian (Google Cloud).
// Toutes les commandes docker et kubectl sont exécutées via SSH sur l'hôte,
// ce qui évite d'installer docker CLI à l'intérieur du container Jenkins.
//
// Stratégie multi-environnement : Kustomize (intégré à kubectl, rien à installer).
//   k8s/base/            → manifests communs (sans namespace)
//   k8s/overlays/<env>/  → namespace + URLs propres à chaque environnement
// Déploiement = `kubectl apply -k k8s/overlays/<env>`.
//
// Mapping branche → environnement :
//   dev      → namespace beown-dev       (URLs *-dev.beown.fr)
//   staging  → namespace beown-staging   (URLs *-staging.beown.fr)
//   test     → namespace beown-test      (URLs *-test.beown.fr)
//   main     → namespace beown           (URLs *.beown.fr)   [confirmation manuelle]
//
// Prérequis sur le serveur (à configurer une seule fois) :
//   1. Générer une clé SSH et l'autoriser sur l'hôte :
//        ssh-keygen -t ed25519 -f /root/.ssh/jenkins_key -N ""
//        cat /root/.ssh/jenkins_key.pub >> /root/.ssh/authorized_keys
//   2. Lancer Jenkins avec --add-host pour joindre l'hôte :
//        docker run --add-host=host.server:host-gateway ...
//
// Plugins Jenkins requis :
//   - SSH Pipeline Steps  (sshCommand)
//   - NodeJS              (tools nodejs — étape de tests)
//   - Email Extension     (emailext — alerte d'échec, cf. bloc `post`)
//
// Prérequis SUPPLÉMENTAIRE sur l'hôte (depuis l'épinglage d'image) :
//   - la CLI `kustomize` (≥ 5). `kubectl kustomize` sait construire un overlay
//     mais PAS l'éditer : `kustomize edit set image` exige le binaire autonome.
//       curl -s "https://raw.githubusercontent.com/kubernetes-sigs/kustomize/master/hack/install_kustomize.sh" | bash
//       sudo mv kustomize /usr/local/bin/
//     Son absence fait échouer le déploiement AVANT tout `apply` (voir
//     deployToEnv) : c'est délibéré — mieux vaut ne pas déployer que déployer
//     une image non épinglée.
//
// Credentials Jenkins (Manage Jenkins > Credentials) :
//   dockerhub-credentials  — Username/Password             (Docker Hub)
//   ssh-host-key           — SSH Username with private key  (hôte du serveur)
// ─────────────────────────────────────────────────────────────────────────────
pipeline {
    agent any

    tools {
        // L'image de production tourne sur Node 22 (dockerfiles/prod.dockerfile).
        // NodeJS-24 est le seul outil Node déclaré dans ce Jenkins ; l'écart est
        // sans effet sur `tsc --noEmit` et sur les tests unitaires (aucun n'ouvre
        // de socket ni de binaire natif spécifique). À aligner sur un outil
        // « NodeJS-22 » dès qu'il sera déclaré, pour tester sur le runtime réel.
        nodejs 'NodeJS-24'
    }

    environment {
        DOCKER_IMAGE   = 'ravikazaha/beown-backside'
        K8S_DEPLOYMENT = 'beown-backend'
        HOST_NAME      = 'host.server'   // résolu vers l'IP hôte via --add-host
    }

    options {
        buildDiscarder(logRotator(numToKeepStr: '10'))
        timeout(time: 30, unit: 'MINUTES')
        disableConcurrentBuilds()
    }

    stages {

        // ─────────────────────────────────────────────────────────
        // 0. INIT — hash git, branche, et mapping branche → environnement
        // ─────────────────────────────────────────────────────────
        stage('Init') {
            steps {
                script {
                    env.GIT_COMMIT_SHORT = sh(
                        script: 'git rev-parse --short HEAD',
                        returnStdout: true
                    ).trim()
                    env.GIT_BRANCH_NAME = (env.GIT_BRANCH ?: env.BRANCH_NAME ?: '')
                        .replaceAll('origin/', '')
                        .trim()
                    env.IMAGE_TAG = "${env.DOCKER_IMAGE}:${env.GIT_COMMIT_SHORT}"

                    // Table de correspondance branche → (environnement, namespace).
                    // L'overlay Kustomize porte le même nom que l'environnement.
                    def envByBranch = [
                        'develop': [name: 'dev',     ns: 'beown-dev'],
                        'staging': [name: 'staging', ns: 'beown-staging'],
                        'test'   : [name: 'test',    ns: 'beown-test'],
                        'main'   : [name: 'production', ns: 'beown'],
                    ]
                    def target = envByBranch[env.GIT_BRANCH_NAME]
                    env.DEPLOY_ENV = target?.name ?: ''
                    env.DEPLOY_NS  = target?.ns   ?: ''

                    echo "Branche : ${env.GIT_BRANCH_NAME}  |  Image : ${env.IMAGE_TAG}  |  Env : ${env.DEPLOY_ENV ?: '(aucun déploiement)'}"
                }
            }
        }

        // ─────────────────────────────────────────────────────────
        // 1. QUALITÉ — porte BLOQUANTE, sur TOUTES les branches
        //
        //    Jusqu'ici le pipeline construisait et poussait une image sans
        //    avoir jamais exécuté ni le compilateur ni un seul test : une
        //    régression de typage ou une suite rouge partait en dev/staging
        //    sans le moindre signal. Ce stage précède le build d'image et
        //    l'échec de n'importe laquelle des trois commandes arrête tout
        //    (comportement `sh` par défaut : exit code non nul = stage FAILED).
        //
        //    `npm ci` (et non `npm install`) : installe exactement le contenu
        //    de package-lock.json, sans jamais le réécrire — le build CI teste
        //    donc l'arbre de dépendances qui partira en image.
        // ─────────────────────────────────────────────────────────
        stage('Tests & Qualité') {
            steps {
                sh 'npm ci'
                // Typage : `nest build` compile mais tolère certains écarts
                // selon tsconfig.build.json ; `tsc --noEmit` couvre TOUT src/,
                // specs comprises.
                sh 'npx tsc --noEmit'
                // Tests unitaires. La config jest de package.json fixe déjà
                // maxWorkers:2 + workerIdleMemoryLimit:1024MB — sans ce bridage,
                // des suites étaient tuées par « Jest worker ran out of memory »
                // et la commande n'était pas reproductible. `--ci` interdit
                // l'écriture de nouveaux snapshots (un snapshot manquant doit
                // échouer en CI, pas être créé en douce).
                sh 'npx jest --ci'
            }
        }

        // ─────────────────────────────────────────────────────────
        // 2. BUILD & PUSH DOCKER IMAGE
        //    Uniquement sur les branches déployables. Exécuté via SSH sur l'hôte.
        // ─────────────────────────────────────────────────────────
        stage('Build & Push Image') {
            when { expression { env.DEPLOY_ENV } }
            steps {
                withCredentials([
                    usernamePassword(
                        credentialsId: 'dockerhub-credentials',
                        usernameVariable: 'DOCKER_USER',
                        passwordVariable: 'DOCKER_PASS'
                    ),
                    sshUserPrivateKey(
                        credentialsId: 'ssh-host-key',
                        keyFileVariable: 'SSH_KEY',
                        usernameVariable: 'SSH_USER'
                    )
                ]) {
                    script {
                        def host = [
                            name         : 'host',
                            host         : env.HOST_NAME,
                            user         : env.SSH_USER,
                            identityFile : env.SSH_KEY,
                            allowAnyHosts: true
                        ]

                        // Archiver uniquement les fichiers trackés (exclut node_modules, .git, etc.)
                        sh "git archive --format=tar.gz HEAD -o beown-source.tar.gz"
                        sshCommand remote: host, command: "mkdir -p /tmp/beown-build/src"
                        sshPut remote: host, from: 'beown-source.tar.gz', into: '/tmp/beown-build'
                        sshCommand remote: host, command: "tar -xzf /tmp/beown-build/beown-source.tar.gz -C /tmp/beown-build/src"

                        // ── Secret Docker Hub : transmis par FICHIER, jamais sur
                        // une ligne de commande.
                        //
                        // L'ancienne forme `echo '<mot de passe>' | docker login`
                        // inscrivait le mot de passe en clair dans la ligne de
                        // commande exécutée sur l'hôte : visible dans `ps` par
                        // n'importe quel utilisateur de la machine le temps du
                        // push, et recopié tel quel dans l'historique shell et
                        // les traces sshd. Le masquage Jenkins ne protège que
                        // les logs du job, pas l'hôte.
                        //
                        // Ici le secret n'existe que dans un fichier 0600, lu
                        // par --password-stdin puis effacé (le `trap` garantit
                        // l'effacement même si le build échoue).
                        writeFile file: 'dockerhub.secret', text: env.DOCKER_PASS
                        sshPut remote: host, from: 'dockerhub.secret', into: '/tmp/beown-build'
                        sh 'rm -f dockerhub.secret'

                        // Build, login, push (tag = SHA de commit court, immuable)
                        sshCommand remote: host, command: """
                            set -e
                            trap 'rm -f /tmp/beown-build/dockerhub.secret' EXIT
                            chmod 600 /tmp/beown-build/dockerhub.secret
                            cd /tmp/beown-build/src
                            docker build -f dockerfiles/prod.dockerfile -t ${env.IMAGE_TAG} .
                            docker login -u '${env.DOCKER_USER}' --password-stdin < /tmp/beown-build/dockerhub.secret
                            docker push ${env.IMAGE_TAG}
                        """

                        // Tag flottant par environnement — REPÈRE DE LECTURE
                        // UNIQUEMENT (« quelle image tourne en staging ? »).
                        // Aucun déploiement ne s'en sert : l'overlay Kustomize
                        // est épinglé au SHA (voir deployToEnv).
                        //
                        // Le tag `latest`, lui, n'est plus poussé du tout. Un
                        // tag mutable pointant sur la production est un piège :
                        // il rend un `docker pull` non reproductible, et le
                        // `image: …:latest` resté dans les manifests
                        // redéployait n'importe quelle build au prochain
                        // redémarrage de pod (imagePullPolicy: Always).
                        sshCommand remote: host, command: """
                            set -e
                            docker tag ${env.IMAGE_TAG} ${env.DOCKER_IMAGE}:${env.DEPLOY_ENV}
                            docker push ${env.DOCKER_IMAGE}:${env.DEPLOY_ENV}
                        """

                        sshCommand remote: host, command: """
                            docker logout
                            docker rmi ${env.IMAGE_TAG} || true
                            rm -rf /tmp/beown-build
                        """
                    }
                }
            }
        }

        // ─────────────────────────────────────────────────────────
        // 3. DEPLOY — dev / staging / test (déploiement automatique)
        //    Un seul stage : l'overlay et le namespace viennent du mapping.
        // ─────────────────────────────────────────────────────────
        stage('Deploy – Non-Prod') {
            when { expression { env.DEPLOY_ENV && env.GIT_BRANCH_NAME != 'main' } }
            steps {
                deployToEnv(env.DEPLOY_ENV, env.DEPLOY_NS)
            }
        }

        // ─────────────────────────────────────────────────────────
        // 4. DEPLOY — PRODUCTION (branche main, confirmation manuelle)
        // ─────────────────────────────────────────────────────────
        stage('Deploy – Production') {
            when { expression { env.GIT_BRANCH_NAME == 'main' } }
            steps {
                input message: "Déployer ${env.GIT_COMMIT_SHORT} en production ?", ok: 'Déployer'
                deployToEnv('production', 'beown')
            }
        }

    }

    // ─────────────────────────────────────────────────────────────
    // NOTIFICATIONS
    // ─────────────────────────────────────────────────────────────
    post {
        success {
            echo "Pipeline réussi — ${env.IMAGE_TAG} (${env.DEPLOY_ENV ?: 'build seul'})"
        }
        failure {
            echo "Échec sur ${env.GIT_BRANCH_NAME} (${env.GIT_COMMIT_SHORT})"
            // Alerte d'échec ACTIVE. Un pipeline dont l'échec n'est visible que
            // dans l'interface Jenkins n'alerte personne : une branche partagée
            // pouvait rester rouge des jours sans que quiconque le sache.
            // Prérequis : plugin Email Extension installé ET un serveur SMTP
            // renseigné dans Manage Jenkins > System > Extended E-mail
            // Notification (sinon le step échoue silencieusement dans `post`).
            emailext subject: "ECHEC CI/CD — BeOwn Backend [${env.GIT_BRANCH_NAME}]",
                     body:    """Le build #${env.BUILD_NUMBER} a échoué.

Branche : ${env.GIT_BRANCH_NAME}
Commit  : ${env.GIT_COMMIT_SHORT}
Env     : ${env.DEPLOY_ENV ?: '(aucun déploiement)'}

Journal complet : ${env.BUILD_URL}console
""",
                     to:      'team@beown.fr'
        }
        always {
            cleanWs()
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fonction de déploiement partagée par tous les environnements.
//   envName   : nom de l'overlay Kustomize (k8s/overlays/<envName>)
//   namespace : namespace k8s cible
//
// ROLLBACK (procédure, à connaître avant de déployer) :
//   kubectl rollout undo deployment/beown-backend -n <namespace>
//   kubectl rollout status deployment/beown-backend -n <namespace>
// L'historique des ReplicaSets porte l'image épinglée au SHA précédent : le
// retour arrière est donc exact, et ne dépend d'aucun tag mutable.
// ─────────────────────────────────────────────────────────────────────────────
void deployToEnv(String envName, String namespace) {
    withCredentials([sshUserPrivateKey(
        credentialsId: 'ssh-host-key',
        keyFileVariable: 'SSH_KEY',
        usernameVariable: 'SSH_USER'
    )]) {
        def host = [
            name         : 'host',
            host         : env.HOST_NAME,
            user         : env.SSH_USER,
            identityFile : env.SSH_KEY,
            allowAnyHosts: true
        ]

        // Envoyer le dossier k8s/ sur l'hôte
        sshCommand remote: host, command: "rm -rf /tmp/beown-k8s && mkdir -p /tmp/beown-k8s"
        sshPut remote: host, from: 'k8s', into: '/tmp/beown-k8s'

        // ── Épinglage de l'image DANS l'overlay, AVANT l'apply ──────────────
        //
        // L'ancienne séquence `kubectl apply -k` + `kubectl set image`
        // produisait DEUX rollouts successifs : l'apply posait d'abord
        // `ravikazaha/beown-backside:latest` (valeur écrite dans
        // k8s/base/deployment.yaml), le cluster commençait à démarrer des pods
        // sur cette image indéterminée, puis le `set image` déclenchait un
        // second rollout vers la bonne. Conséquences : une fenêtre pendant
        // laquelle la production tournait sur une image inconnue, deux fois
        // plus de churn de pods, et un `kubectl rollout undo` qui remonte sur
        // l'étape intermédiaire au lieu de la version précédente.
        //
        // `kustomize edit set image` réécrit l'overlay avant l'apply : un seul
        // rollout, vers une image identifiée par son SHA de commit.
        //
        // Le `command -v kustomize` fait échouer le déploiement si la CLI
        // manque, AVANT d'avoir rien appliqué — sans ce garde-fou l'apply
        // partirait avec `:latest`, exactement ce qu'on cherche à supprimer.
        sshCommand remote: host, command: """
            set -e
            command -v kustomize >/dev/null 2>&1 || {
                echo "ERREUR : la CLI kustomize est absente de l'hôte — déploiement interrompu."
                echo "Sans elle l'image ne peut pas être épinglée et l'overlay déploierait :latest."
                echo "Installation : curl -s https://raw.githubusercontent.com/kubernetes-sigs/kustomize/master/hack/install_kustomize.sh | bash && sudo mv kustomize /usr/local/bin/"
                exit 1
            }
            cd /tmp/beown-k8s/k8s/overlays/${envName}
            kustomize edit set image ${env.DOCKER_IMAGE}=${env.IMAGE_TAG}
            echo "── Image épinglée dans l'overlay ${envName} ──"
            grep -A3 '^images:' kustomization.yaml
        """

        // Créer le namespace si absent, puis appliquer l'overlay déjà épinglé
        sshCommand remote: host, command: """
            set -e
            kubectl create namespace ${namespace} --dry-run=client -o yaml | kubectl apply -f -
            kubectl apply -k /tmp/beown-k8s/k8s/overlays/${envName}
            kubectl rollout status deployment/${env.K8S_DEPLOYMENT} -n ${namespace} --timeout=180s
        """

        // ── Migrations et seed : VOLONTAIREMENT ABSENTS de ce pipeline ──────
        //
        // Ce que faisaient les deux `kubectl exec` retirés ici :
        //   npm run migration:run   sur tous les environnements
        //   npm run seed            en plus, sur dev / staging / test
        //
        // Pourquoi ils sont supprimés, et pas seulement désactivés :
        //
        //  1. `migration:run` est CASSÉ. Le schéma de développement n'est
        //     construit que par le `synchronize` du seed ; le jeu de migrations
        //     n'est pas rejouable en l'état. Le laisser dans le pipeline, c'est
        //     faire échouer chaque déploiement — ou pire, appliquer une
        //     migration partielle sur une base partagée.
        //
        //  2. `seed` RÉÉCRIT LE SCHÉMA d'un environnement partagé. À chaque
        //     merge sur `develop`, staging et dev repartaient sur des données
        //     de démonstration : le travail de recette en cours était écrasé,
        //     sans avertissement ni sauvegarde.
        //
        //  3. Une migration de base ne se déploie pas dans le même geste que
        //     l'application. Elle doit être réversible, compatible avec
        //     l'ancienne version le temps du rolling update, et déclenchée
        //     sciemment — pas en effet de bord d'un push.
        //
        // DETTE ASSUMÉE : tant que le jeu de migrations n'est pas réparé, toute
        // évolution de schéma se fait à la main, en connaissance de cause, hors
        // pipeline (procédure : sauvegarde d'abord — voir le CronJob
        // k8s/base/backup-cronjob.yaml — puis application, puis vérification).
        // Réparer les migrations est le prérequis à une étape de migration
        // automatisée : un Job k8s distinct, exécuté AVANT le rollout, avec son
        // propre statut et son propre rollback.

        sshCommand remote: host, command: "rm -rf /tmp/beown-k8s"
    }
}
