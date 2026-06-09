// ─────────────────────────────────────────────────────────────────────────────
// Jenkins CI/CD — BeOwn Backend
//
// Jenkins tourne sur le serveur Linux/Debian (Google Cloud) dans Docker.
// kubectl est exécuté directement sur ce serveur (plus de SSH).
// Staging et Production tournent sur le même cluster Kubernetes,
// séparés par namespace : beown-staging  /  beown
//
// Prérequis sur le serveur (à configurer une seule fois) :
//   1. Container Jenkins monté avec le socket Docker et le kubeconfig :
//        -v /var/run/docker.sock:/var/run/docker.sock
//        -v /root/.kube:/root/.kube
//   2. kubectl installé dans le container Jenkins ou disponible sur l'hôte
//
// Plugins Jenkins requis :
//   - Docker Pipeline
//   - HTML Publisher (optionnel)
//
// Credentials Jenkins (Manage Jenkins > Credentials) :
//   dockerhub-credentials  — Username/Password  (Docker Hub)
// ─────────────────────────────────────────────────────────────────────────────
pipeline {
    agent any

    environment {
        DOCKER_IMAGE   = 'ravikazaha/beown-backside'
        K8S_DEPLOYMENT = 'beown-backend'
        K8S_NS_PROD    = 'beown'
        K8S_NS_STG     = 'beown-staging'
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
        // ─────────────────────────────────────────────────────────
        stage('Build & Push Image') {
            when {
                expression {
                    env.GIT_BRANCH_NAME in ['main', 'develop'] ||
                    env.GIT_BRANCH_NAME?.startsWith('release/')
                }
            }
            steps {
                withCredentials([usernamePassword(
                    credentialsId: 'dockerhub-credentials',
                    usernameVariable: 'DOCKER_USER',
                    passwordVariable: 'DOCKER_PASS'
                )]) {
                    script {
                        sh "docker build -f dockerfiles/prod.dockerfile -t ${env.IMAGE_TAG} ."

                        sh 'echo "$DOCKER_PASS" | docker login -u "$DOCKER_USER" --password-stdin'

                        sh "docker push ${env.IMAGE_TAG}"

                        if (env.GIT_BRANCH_NAME == 'main') {
                            sh """
                                docker tag ${env.IMAGE_TAG} ${env.DOCKER_IMAGE}:latest
                                docker push ${env.DOCKER_IMAGE}:latest
                            """
                        }
                        if (env.GIT_BRANCH_NAME == 'develop') {
                            sh """
                                docker tag ${env.IMAGE_TAG} ${env.DOCKER_IMAGE}:develop
                                docker push ${env.DOCKER_IMAGE}:develop
                            """
                        }
                    }
                }
            }
            post {
                always {
                    sh 'docker logout'
                    sh "docker rmi ${env.IMAGE_TAG} || true"
                }
            }
        }

        // ─────────────────────────────────────────────────────────
        // 2. DEPLOY — STAGING  (branche develop)
        //    Namespace : beown-staging
        //    Les manifests k8s/ sont appliqués avec le namespace
        //    substitué à la volée via sed (évite de dupliquer les fichiers)
        // ─────────────────────────────────────────────────────────
        stage('Deploy – Staging') {
            when { expression { env.GIT_BRANCH_NAME == 'develop' } }
            steps {
                script {
                    // Créer le namespace staging s'il n'existe pas encore
                    sh "kubectl create namespace ${env.K8S_NS_STG} --dry-run=client -o yaml | kubectl apply -f -"

                    // Appliquer les manifests en remplaçant le namespace à la volée
                    sh "sed 's/namespace: ${env.K8S_NS_PROD}/namespace: ${env.K8S_NS_STG}/g' k8s/*.yaml | kubectl apply -f -"

                    // Mettre à jour l'image du déploiement
                    sh """
                        kubectl set image deployment/${env.K8S_DEPLOYMENT} \
                            ${env.K8S_DEPLOYMENT}=${env.IMAGE_TAG} \
                            -n ${env.K8S_NS_STG}
                        kubectl rollout status deployment/${env.K8S_DEPLOYMENT} \
                            -n ${env.K8S_NS_STG} --timeout=120s
                    """
                }
            }
        }

        // ─────────────────────────────────────────────────────────
        // 3. DEPLOY — PRODUCTION  (branche main)
        //    Namespace : beown
        //    Confirmation manuelle avant déploiement
        // ─────────────────────────────────────────────────────────
        stage('Deploy – Production') {
            when { expression { env.GIT_BRANCH_NAME == 'main' } }
            steps {
                input message: "Déployer ${env.GIT_COMMIT_SHORT} en production ?", ok: 'Déployer'

                script {
                    sh "kubectl apply -f k8s/"

                    sh """
                        kubectl set image deployment/${env.K8S_DEPLOYMENT} \
                            ${env.K8S_DEPLOYMENT}=${env.IMAGE_TAG} \
                            -n ${env.K8S_NS_PROD}
                        kubectl rollout status deployment/${env.K8S_DEPLOYMENT} \
                            -n ${env.K8S_NS_PROD} --timeout=180s
                    """
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
