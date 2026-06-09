// ─────────────────────────────────────────────────────────────────────────────
// Jenkins CI/CD — BeOwn Backend
//
// Plugins requis :
//   - Docker Pipeline
//   - SSH Pipeline Steps  (sshCommand / sshPut)
//   - HTML Publisher
//   - JUnit
//
// Credentials à créer dans Jenkins (Manage Jenkins > Credentials) :
//   dockerhub-credentials  — Username/Password  (Docker Hub)
//   ssh-prod-key           — SSH Username with private key  (serveur prod Linux/Debian)
//   ssh-staging-key        — SSH Username with private key  (serveur staging)
// ─────────────────────────────────────────────────────────────────────────────
pipeline {
    // Jenkins tourne sur Windows → agent any = exécuteur Windows
    // Les stages Node.js utilisent un agent Docker Linux (sh valide à l'intérieur)
    agent any

    environment {
        DOCKER_IMAGE   = 'ravikazaha/beown-backside'
        K8S_NAMESPACE  = 'beown'
        K8S_DEPLOYMENT = 'beown-backend'
        NODE_VERSION   = '22'
        REMOTE_HOST    = '34.35.29.154'   // IP du serveur distant (depuis k8s/01-configmap.yaml)
        REMOTE_K8S_DIR = '/tmp/beown-k8s' // Dossier temporaire sur le serveur distant
    }

    options {
        buildDiscarder(logRotator(numToKeepStr: '10'))
        timeout(time: 30, unit: 'MINUTES')
        disableConcurrentBuilds()
    }

    stages {

        // ─────────────────────────────────────────────────────────
        // 0. INIT — récupérer le hash git (bat car agent Windows)
        // ─────────────────────────────────────────────────────────
        stage('Init') {
            steps {
                script {
                    // Le @ supprime l'écho de la commande dans bat
                    env.GIT_COMMIT_SHORT = bat(
                        script: '@git rev-parse --short HEAD',
                        returnStdout: true
                    ).trim()
                    env.IMAGE_TAG = "${env.DOCKER_IMAGE}:${env.GIT_COMMIT_SHORT}"
                    echo "Branche : ${env.BRANCH_NAME}  |  Image : ${env.IMAGE_TAG}"
                }
            }
            
        }

        // ─────────────────────────────────────────────────────────
        // 1. INSTALL  (bat — Node.js installé sur le serveur Jenkins Windows)
        // ─────────────────────────────────────────────────────────
        stage('Install') {
            steps {
                bat 'npm ci --prefer-offline'
            }
        }

        // ─────────────────────────────────────────────────────────
        // 2. LINT
        // ─────────────────────────────────────────────────────────
        stage('Lint') {
            steps {
                bat 'npm run lint'
            }
        }

        // ─────────────────────────────────────────────────────────
        // 4. BUILD & PUSH DOCKER IMAGE
        //    bat car Docker Desktop tourne sur l'agent Windows
        // ─────────────────────────────────────────────────────────
        stage('Build & Push Image') {
            when {
                anyOf {
                    branch 'main'
                    branch 'develop'
                    branch pattern: 'release/.*', comparator: 'REGEXP'
                }
            }
            steps {
                withCredentials([usernamePassword(
                    credentialsId: 'dockerhub-credentials',
                    usernameVariable: 'DOCKER_USER',
                    passwordVariable: 'DOCKER_PASS'
                )]) {
                    script {
                        // Build de l'image
                        bat "docker build -f dockerfiles/prod.dockerfile -t %IMAGE_TAG% ."

                        // Login Docker Hub
                        bat "echo %DOCKER_PASS%| docker login -u %DOCKER_USER% --password-stdin"

                        // Push du tag commit
                        bat "docker push %IMAGE_TAG%"

                        // Tags supplémentaires selon la branche
                        if (env.BRANCH_NAME == 'main') {
                            bat """
                                docker tag %IMAGE_TAG% %DOCKER_IMAGE%:latest
                                docker push %DOCKER_IMAGE%:latest
                            """
                        }
                        if (env.BRANCH_NAME == 'develop') {
                            bat """
                                docker tag %IMAGE_TAG% %DOCKER_IMAGE%:develop
                                docker push %DOCKER_IMAGE%:develop
                            """
                        }
                    }
                }
            }
            post {
                always {
                    bat 'docker logout'
                    // Libérer l'espace disque de l'agent
                    bat "docker rmi %IMAGE_TAG% 2>nul & exit 0"
                }
            }
        }

        // ─────────────────────────────────────────────────────────
        // 5. DEPLOY — STAGING  (branche develop)
        // ─────────────────────────────────────────────────────────
        stage('Deploy – Staging') {
            when { branch 'develop' }
            steps {
                withCredentials([sshUserPrivateKey(
                    credentialsId: 'ssh-staging-key',
                    keyFileVariable: 'SSH_KEY',
                    usernameVariable: 'SSH_USER'
                )]) {
                    script {
                        def remote = [
                            name          : 'staging',
                            host          : env.REMOTE_HOST,
                            user          : env.SSH_USER,
                            identityFile  : env.SSH_KEY,
                            allowAnyHosts : true
                        ]

                        sshCommand remote: remote, command: "mkdir -p ${env.REMOTE_K8S_DIR}"
                        sshPut    remote: remote, from: 'k8s', into: env.REMOTE_K8S_DIR

                        sshCommand remote: remote, command: """
                            kubectl apply -f ${env.REMOTE_K8S_DIR}/k8s/
                            kubectl set image deployment/${env.K8S_DEPLOYMENT} \
                                ${env.K8S_DEPLOYMENT}=${env.IMAGE_TAG} \
                                -n ${env.K8S_NAMESPACE}
                            kubectl rollout status deployment/${env.K8S_DEPLOYMENT} \
                                -n ${env.K8S_NAMESPACE} --timeout=120s
                        """
                    }
                }
            }
        }

        // ─────────────────────────────────────────────────────────
        // 6. DEPLOY — PRODUCTION  (branche main)
        //    Confirmation manuelle avant déploiement
        // ─────────────────────────────────────────────────────────
        stage('Deploy – Production') {
            when { branch 'main' }
            steps {
                input message: "Déployer ${env.GIT_COMMIT_SHORT} en production ?", ok: 'Déployer'

                withCredentials([sshUserPrivateKey(
                    credentialsId: 'ssh-prod-key',
                    keyFileVariable: 'SSH_KEY',
                    usernameVariable: 'SSH_USER'
                )]) {
                    script {
                        def remote = [
                            name          : 'production',
                            host          : env.REMOTE_HOST,
                            user          : env.SSH_USER,
                            identityFile  : env.SSH_KEY,
                            allowAnyHosts : true
                        ]

                        // Copier les manifests k8s sur le serveur distant
                        sshCommand remote: remote, command: "mkdir -p ${env.REMOTE_K8S_DIR}"
                        sshPut    remote: remote, from: 'k8s', into: env.REMOTE_K8S_DIR

                        // Appliquer tous les manifests puis mettre à jour l'image
                        sshCommand remote: remote, command: """
                            kubectl apply -f ${env.REMOTE_K8S_DIR}/k8s/
                            kubectl set image deployment/${env.K8S_DEPLOYMENT} \
                                ${env.K8S_DEPLOYMENT}=${env.IMAGE_TAG} \
                                -n ${env.K8S_NAMESPACE}
                            kubectl rollout status deployment/${env.K8S_DEPLOYMENT} \
                                -n ${env.K8S_NAMESPACE} --timeout=180s
                        """
                    }
                }
            }
        }

    }

    // ─────────────────────────────────────────────────────────────
    // NOTIFICATIONS
    // ─────────────────────────────────────────────────────────────
    post {
        success {
            echo "Pipeline réussi — ${env.IMAGE_TAG}"
        }
        failure {
            echo "Échec sur ${env.BRANCH_NAME} (${env.GIT_COMMIT_SHORT})"
            // emailext subject: "ECHEC CI/CD — BeOwn [${env.BRANCH_NAME}]",
            //          body:    "Build #${env.BUILD_NUMBER} a échoué.\n${env.BUILD_URL}",
            //          to:      'team@beown.com'
        }
        always {
            cleanWs()
        }
    }
}
