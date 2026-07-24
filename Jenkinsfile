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
//
// Credentials Jenkins (Manage Jenkins > Credentials) :
//   dockerhub-credentials  — Username/Password             (Docker Hub)
//   ssh-host-key           — SSH Username with private key  (hôte du serveur)
// ─────────────────────────────────────────────────────────────────────────────
pipeline {
    agent any

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
        // 1. BUILD & PUSH DOCKER IMAGE
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

                        // Build, login, push (tag = commit court)
                        sshCommand remote: host, command: """
                            cd /tmp/beown-build/src
                            docker build -f dockerfiles/prod.dockerfile -t ${env.IMAGE_TAG} .
                            echo '${env.DOCKER_PASS}' | docker login -u '${env.DOCKER_USER}' --password-stdin
                            docker push ${env.IMAGE_TAG}
                        """

                        // Tag flottant par environnement (facultatif, pratique pour rollback manuel)
                        sshCommand remote: host, command: """
                            docker tag ${env.IMAGE_TAG} ${env.DOCKER_IMAGE}:${env.DEPLOY_ENV}
                            docker push ${env.DOCKER_IMAGE}:${env.DEPLOY_ENV}
                        """
                        if (env.GIT_BRANCH_NAME == 'main') {
                            sshCommand remote: host, command: """
                                docker tag ${env.IMAGE_TAG} ${env.DOCKER_IMAGE}:latest
                                docker push ${env.DOCKER_IMAGE}:latest
                            """
                        }

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
        // 2. DEPLOY — dev / staging / test (déploiement automatique)
        //    Un seul stage : l'overlay et le namespace viennent du mapping.
        // ─────────────────────────────────────────────────────────
        stage('Deploy – Non-Prod') {
            when { expression { env.DEPLOY_ENV && env.GIT_BRANCH_NAME != 'main' } }
            steps {
                deployToEnv(env.DEPLOY_ENV, env.DEPLOY_NS, true)
            }
        }

        // ─────────────────────────────────────────────────────────
        // 3. DEPLOY — PRODUCTION (branche main, confirmation manuelle)
        // ─────────────────────────────────────────────────────────
        stage('Deploy – Production') {
            when { expression { env.GIT_BRANCH_NAME == 'main' } }
            steps {
                input message: "Déployer ${env.GIT_COMMIT_SHORT} en production ?", ok: 'Déployer'
                deployToEnv('production', 'beown', false)
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
            // emailext subject: "ECHEC CI/CD — BeOwn [${env.GIT_BRANCH_NAME}]",
            //          body:    "Build #${env.BUILD_NUMBER} a échoué.\n${env.BUILD_URL}",
            //          to:      'team@beown.fr'
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
//   runSeed   : true pour les envs non-prod (migration + seed), false en prod
// ─────────────────────────────────────────────────────────────────────────────
void deployToEnv(String envName, String namespace, boolean runSeed) {
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

        // Créer le namespace si absent, puis appliquer l'overlay Kustomize
        sshCommand remote: host, command: """
            kubectl create namespace ${namespace} --dry-run=client -o yaml | kubectl apply -f -
            kubectl apply -k /tmp/beown-k8s/k8s/overlays/${envName}
            kubectl set image deployment/${env.K8S_DEPLOYMENT} ${env.K8S_DEPLOYMENT}=${env.IMAGE_TAG} -n ${namespace}
            kubectl rollout status deployment/${env.K8S_DEPLOYMENT} -n ${namespace} --timeout=180s
        """

        if (runSeed) {
            sshCommand remote: host, command: """
                kubectl exec deployment/${env.K8S_DEPLOYMENT} -n ${namespace} -- npm run migration:run
                kubectl exec deployment/${env.K8S_DEPLOYMENT} -n ${namespace} -- npm run seed
            """
        } else {
            // En production : migrations uniquement, jamais de seed
            sshCommand remote: host, command: """
                kubectl exec deployment/${env.K8S_DEPLOYMENT} -n ${namespace} -- npm run migration:run
            """
        }

        sshCommand remote: host, command: "rm -rf /tmp/beown-k8s"
    }
}
