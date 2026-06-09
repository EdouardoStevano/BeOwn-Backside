// ─────────────────────────────────────────────────────────────────────────────
// Jenkins CI/CD — BeOwn Backend
//
// Jenkins tourne dans Docker sur le serveur Linux/Debian (Google Cloud).
// Toutes les commandes docker et kubectl sont exécutées via SSH sur l'hôte,
// ce qui évite d'installer docker CLI à l'intérieur du container Jenkins.
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
//   dockerhub-credentials  — Username/Password        (Docker Hub)
//   ssh-host-key           — SSH Username with private key  (hôte du serveur)
// ─────────────────────────────────────────────────────────────────────────────
pipeline {
    agent any

    environment {
        DOCKER_IMAGE   = 'ravikazaha/beown-backside'
        K8S_DEPLOYMENT = 'beown-backend'
        K8S_NS_PROD    = 'beown'
        K8S_NS_STG     = 'beown-staging'
        HOST_NAME      = 'host.server'   // résolu vers l'IP hôte via --add-host
    }

    options {
        buildDiscarder(logRotator(numToKeepStr: '10'))
        timeout(time: 30, unit: 'MINUTES')
        disableConcurrentBuilds()
    }

    stages {

        // ─────────────────────────────────────────────────────────
        // 0. INIT — récupérer le hash git et le nom de branche
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
                    echo "Branche : ${env.GIT_BRANCH_NAME}  |  Image : ${env.IMAGE_TAG}"
                }
            }
        }

        // ─────────────────────────────────────────────────────────
        // 1. BUILD & PUSH DOCKER IMAGE
        //    Exécuté via SSH sur l'hôte — docker CLI disponible nativement
        // ─────────────────────────────────────────────────────────
        stage('Build & Push Image') {
            when {
                expression {
                    env.GIT_BRANCH_NAME in ['main', 'develop'] ||
                    env.GIT_BRANCH_NAME?.startsWith('release/')
                }
            }
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

                        // Copier les sources sur l'hôte
                        sshCommand remote: host, command: "mkdir -p /tmp/beown-build"
                        sshPut remote: host, from: '.', into: '/tmp/beown-build'

                        // Build, login, push
                        sshCommand remote: host, command: """
                            cd /tmp/beown-build/beown-backend_
                            docker build -f dockerfiles/prod.dockerfile -t ${env.IMAGE_TAG} .
                            echo '${env.DOCKER_PASS}' | docker login -u '${env.DOCKER_USER}' --password-stdin
                            docker push ${env.IMAGE_TAG}
                        """

                        if (env.GIT_BRANCH_NAME == 'main') {
                            sshCommand remote: host, command: """
                                docker tag ${env.IMAGE_TAG} ${env.DOCKER_IMAGE}:latest
                                docker push ${env.DOCKER_IMAGE}:latest
                            """
                        }
                        if (env.GIT_BRANCH_NAME == 'develop') {
                            sshCommand remote: host, command: """
                                docker tag ${env.IMAGE_TAG} ${env.DOCKER_IMAGE}:develop
                                docker push ${env.DOCKER_IMAGE}:develop
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
        // 2. DEPLOY — STAGING  (branche develop)
        //    Namespace : beown-staging
        // ─────────────────────────────────────────────────────────
        stage('Deploy – Staging') {
            when { expression { env.GIT_BRANCH_NAME == 'develop' } }
            steps {
                withCredentials([sshUserPrivateKey(
                    credentialsId: 'ssh-host-key',
                    keyFileVariable: 'SSH_KEY',
                    usernameVariable: 'SSH_USER'
                )]) {
                    script {
                        def host = [
                            name         : 'host',
                            host         : env.HOST_NAME,
                            user         : env.SSH_USER,
                            identityFile : env.SSH_KEY,
                            allowAnyHosts: true
                        ]

                        sshCommand remote: host, command: "mkdir -p /tmp/beown-k8s"
                        sshPut remote: host, from: 'k8s', into: '/tmp/beown-k8s'

                        sshCommand remote: host, command: """
                            kubectl create namespace ${env.K8S_NS_STG} --dry-run=client -o yaml | kubectl apply -f -
                            sed 's/namespace: ${env.K8S_NS_PROD}/namespace: ${env.K8S_NS_STG}/g' /tmp/beown-k8s/k8s/*.yaml | kubectl apply -f -
                            kubectl set image deployment/${env.K8S_DEPLOYMENT} \
                                ${env.K8S_DEPLOYMENT}=${env.IMAGE_TAG} \
                                -n ${env.K8S_NS_STG}
                            kubectl rollout status deployment/${env.K8S_DEPLOYMENT} \
                                -n ${env.K8S_NS_STG} --timeout=120s
                            rm -rf /tmp/beown-k8s
                        """
                    }
                }
            }
        }

        // ─────────────────────────────────────────────────────────
        // 3. DEPLOY — PRODUCTION  (branche main)
        //    Namespace : beown — confirmation manuelle requise
        // ─────────────────────────────────────────────────────────
        stage('Deploy – Production') {
            when { expression { env.GIT_BRANCH_NAME == 'main' } }
            steps {
                input message: "Déployer ${env.GIT_COMMIT_SHORT} en production ?", ok: 'Déployer'

                withCredentials([sshUserPrivateKey(
                    credentialsId: 'ssh-host-key',
                    keyFileVariable: 'SSH_KEY',
                    usernameVariable: 'SSH_USER'
                )]) {
                    script {
                        def host = [
                            name         : 'host',
                            host         : env.HOST_NAME,
                            user         : env.SSH_USER,
                            identityFile : env.SSH_KEY,
                            allowAnyHosts: true
                        ]

                        sshCommand remote: host, command: "mkdir -p /tmp/beown-k8s"
                        sshPut remote: host, from: 'k8s', into: '/tmp/beown-k8s'

                        sshCommand remote: host, command: """
                            kubectl apply -f /tmp/beown-k8s/k8s/
                            kubectl set image deployment/${env.K8S_DEPLOYMENT} \
                                ${env.K8S_DEPLOYMENT}=${env.IMAGE_TAG} \
                                -n ${env.K8S_NS_PROD}
                            kubectl rollout status deployment/${env.K8S_DEPLOYMENT} \
                                -n ${env.K8S_NS_PROD} --timeout=180s
                            rm -rf /tmp/beown-k8s
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
            echo "Échec sur ${env.GIT_BRANCH_NAME} (${env.GIT_COMMIT_SHORT})"
            // emailext subject: "ECHEC CI/CD — BeOwn [${env.GIT_BRANCH_NAME}]",
            //          body:    "Build #${env.BUILD_NUMBER} a échoué.\n${env.BUILD_URL}",
            //          to:      'team@beown.com'
        }
        always {
            cleanWs()
        }
    }
}
