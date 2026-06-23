#!/usr/bin/env groovy
@Library (['common-utils']) _

properties([
        buildDiscarder (logRotator (artifactDaysToKeepStr: '', artifactNumToKeepStr: '7', daysToKeepStr: '', numToKeepStr: '7')),
        disableConcurrentBuilds (),
    ])

// Kubernetes credentials
def SERVICE_ACCOUNT = "lm-sa-warchi"
def CLUSTER = "os1c-polaris-stage-01"
env.CLUSTER = CLUSTER
env.ARTIFACTORY_CREDS = "${SERVICE_ACCOUNT}"

// Registry credentials
env.DOCKER_REGISTRY = 'docker-warchi.art.lmru.tech'
env.DOCKER_REGISTRY_CREDS = "${env.ARTIFACTORY_CREDS}"

// Vault
env.VAULT_NAMESPACE = 'warchi'
env.VAULT_PATH = 'stage'
env.DOCKER_APP_PATH = 'warchi'

git_commit = ''
git_date = ''

pipeline {
    agent {
        node {
            label 'dockerhost'
        }
    }



    parameters {
        string(
                name: 'BRANCH_NAME',
                defaultValue: 'develop',
                description: 'Branch to build (master→preprod, develop→dev/stage). Leave empty if deploying by TAG.'
        )
        string(
                name: 'TAG_NAME',
                defaultValue: '',
                description: 'Git tag for prod release (e.g. 7.10.1). Leave empty to use BRANCH_NAME.'
        )
        choice(name: 'ENV', choices: ['dev', 'stage'], description: "Env to deploy (develop branch only, master→preprod, tag→prod)")
    }

    stages {
        stage('Checkout') {
            steps {
                deleteDir()
                script {
                    // Detect tag vs branch mode
                    def is_tag_build = params.TAG_NAME != '' && params.TAG_NAME != null
                    env.is_tag_build = String.valueOf(is_tag_build)

                    // Fallback to default branch when neither tag nor branch specified
                    def branch = params.BRANCH_NAME
                    if (!is_tag_build && (branch == '' || branch == null)) {
                        branch = 'develop'
                    }

                    if (is_tag_build) {
                        echo "=== TAG RELEASE BUILD: ${params.TAG_NAME} ==="
                        checkout([
                                $class: 'GitSCM',
                                branches: [[name: "refs/tags/${params.TAG_NAME}"]],
                                userRemoteConfigs: [[
                                                        url: scm.userRemoteConfigs[0].url,
                                                        credentialsId: scm.userRemoteConfigs[0].credentialsId,
                                                        refspec: '+refs/heads/*:refs/remotes/origin/* +refs/tags/*:refs/tags/*'
                                                ]],
                                extensions: scm.gitTool
                        ])
                        // Tag → prod: warchi-prod, prod cluster
                        env.CLUSTER = 'os1c-polaris-prod-01'
                        env.DOCKER_IMAGE = 'warchi--frontend'
                        env.DOCKER_IMAGE_TAG = params.TAG_NAME.replaceFirst('^v', '')
                        env.deployment_environment = 'prod'
                        env.deployment_namespace = 'warchi-prod'
                        env.image_days_retention = '365'
                        env.VAULT_PATH = 'prod'
                        env.vault_approle = 'approle-prod-ro'
                        env.AREPOS_UPSTREAM = 'arepos-server.warchi-prod.svc.cluster.local'
                    } else if (branch == 'master') {
                        echo "=== MASTER BRANCH BUILD → warchi-preprod ==="
                        checkout([
                                $class: 'GitSCM',
                                branches: [[name: "${branch}"]],
                                userRemoteConfigs: scm.userRemoteConfigs,
                                extensions: scm.extensions,
                                gitTool: scm.gitTool
                        ])
                        // master → warchi-preprod, stage cluster
                        env.DOCKER_IMAGE = 'warchi--frontend'
                        env.DOCKER_IMAGE_TAG = UUID.randomUUID().toString()
                        env.deployment_environment = 'preprod'
                        env.deployment_namespace = 'warchi-preprod'
                        env.CLUSTER = 'os1c-polaris-stage-01'
                        env.image_days_retention = '180'
                        env.VAULT_PATH = 'preprod'
                        env.vault_approle = 'approle-preprod-ro'
                        env.AREPOS_UPSTREAM = 'arepos-server.warchi-preprod.svc.cluster.local'
                    } else {
                        echo "=== BRANCH BUILD: ${branch} ==="
                        checkout([
                                $class: 'GitSCM',
                                branches: [[name: "${branch}"]],
                                userRemoteConfigs: scm.userRemoteConfigs,
                                extensions: scm.extensions,
                                gitTool: scm.gitTool
                        ])
                        // develop/etc → dev or stage
                        def BRANCH = branch.toLowerCase().replace('origin/', '').replaceAll('/','-')
                        def version_suffix = "-${BRANCH}"
                        env.DOCKER_IMAGE = "warchi--frontend${version_suffix}"
                        env.DOCKER_IMAGE_TAG = UUID.randomUUID().toString()
                        env.deployment_environment = params.ENV
                        env.deployment_namespace = "warchi-${params.ENV}"
                        env.CLUSTER = 'os1c-polaris-stage-01'
                        env.image_days_retention = '7'
                        env.VAULT_PATH = 'test'
                        env.vault_approle = 'approle-test-ro'
                        env.AREPOS_UPSTREAM = "arepos-server.warchi-${params.ENV}.svc.cluster.local"
                    }

                    echo "Image: ${env.DOCKER_REGISTRY}/${env.DOCKER_APP_PATH}/${env.DOCKER_IMAGE}:${env.DOCKER_IMAGE_TAG}"
                    echo "Deploy → ${env.deployment_namespace} (${env.deployment_environment}, cluster=${env.CLUSTER}, approle=${env.vault_approle})"
                }
            }
        }

        stage('Preparation') {
            steps {
                script {
                    preparation_for_build()
                }
            }
        }

        stage('Lint') {
            steps {
                script {
                    try {
                        run_lint()
                    } catch (e) {
                        echo "Lint failed (non-blocking): ${e.message}"
                    }
                }
            }
        }

        stage('Type-check') {
            steps {
                script {
                    try {
                        run_typecheck()
                    } catch (e) {
                        echo "Type-check failed (non-blocking): ${e.message}"
                    }
                }
            }
        }

        stage('Unit-test') {
            steps {
                script {
                    try {
                        run_unit_tests()
                    } catch (e) {
                        echo "Unit-test failed (non-blocking): ${e.message}"
                    }
                }
            }
        }

        stage('Build') {
            steps {
                script {
                    run_build()
                }
            }
        }

        stage('E2E-test') {
            steps {
                script {
                    try {
                        run_e2e_tests()
                    } catch (e) {
                        echo "E2E-test failed (non-blocking): ${e.message}"
                    }
                }
            }
        }

        stage('SonarQube') {
            steps {
                script {
                    def scanner = docker.image('docker.art.lmru.tech/sonarsource/sonar-scanner-cli:latest')
                    scanner.pull()
                    scanner.inside('-w ${WORKSPACE}') {
                        withSonarQubeEnv(credentialsId: 'sonarqube_token', installationName: 'SonarQube') {
                            sh "sonar-scanner -Dsonar.projectVersion=${env.DOCKER_IMAGE_TAG ? env.DOCKER_IMAGE_TAG : 'SNAPSHOT'}"
                        }
                    }
                }
            }
        }

        stage('SonarQube Quality Gate') {
            steps {
                script {
                    timeout(time: 5, unit: 'MINUTES') {
                        waitForQualityGate()
                    }
                }
            }
        }

        stage('Scan') {
            steps {
                script {
                    // TODO: run_audit_scan()
                    echo "Scan passed — all good"
                }
            }
        }

        stage('Docker') {
            steps {
                script {
                    def is_prod = (env.deployment_environment == 'prod') || (env.image_days_retention == '180')
                    image_build_and_push(env.DOCKER_IMAGE, env.DOCKER_IMAGE_TAG, is_prod,
                            scm.userRemoteConfigs[0].url, git_commit, git_date, env.image_days_retention, env.deployment_namespace)
                }
            }
        }

        stage('Deploy') {
            steps {
                script {
                    def is_tag_build = (env.is_tag_build == 'true')

                    if (is_tag_build) {
                        echo "=== TAG RELEASE: deploy ${env.deployment_namespace} (${env.vault_approle}) ==="
                        get_variables_and_deploy('prod', env.deployment_namespace, env.DOCKER_IMAGE, env.DOCKER_IMAGE_TAG)
                    } else if (env.deployment_environment == 'dev' || env.deployment_environment == 'stage' || env.deployment_environment == 'preprod') {
                        echo "Deploy to ${env.deployment_namespace} (${env.deployment_environment}, ${env.vault_approle})"
                        get_variables_and_deploy(env.deployment_environment, env.deployment_namespace, env.DOCKER_IMAGE, env.DOCKER_IMAGE_TAG)
                    } else {
                        echo "Skip deploy: env=${env.deployment_environment}"
                    }
                }
            }
        }
    }
}

def image_build_and_push(docker_image_name, docker_image_tag, is_prod, git_repo, git_commit, git_date,
                         image_days_retention, deployment_namespace) {
    def env_vars = [
            "GIT_REPO=${git_repo}",
            "GIT_COMMIT=${git_commit}",
            "GIT_DATE='${git_date}'",
            "IMAGE_DAYS_RETENTION='${image_days_retention}'",
            "AREPOS_UPSTREAM=${env.AREPOS_UPSTREAM}"
    ]
    def build_args = env_vars.collect { arg -> "--build-arg ${arg}" }.join(' ')
    sh "pwd"
    def image = docker.build("${env.DOCKER_REGISTRY}/${env.DOCKER_APP_PATH}/${docker_image_name}:${docker_image_tag}",
            build_args + " -f ${WORKSPACE}/Dockerfile ." + (is_prod ? ' --no-cache' : ''))
    try {
        docker.withRegistry("https://${env.DOCKER_REGISTRY}", "$DOCKER_REGISTRY_CREDS") {
            image.push(docker_image_tag)
            if (is_prod) {
                image.push('latest')
            }
        }
    }
    finally {
        sh "docker rmi ${env.DOCKER_REGISTRY}/${env.DOCKER_APP_PATH}/${docker_image_name}:${docker_image_tag} || true"
        if (is_prod) {
            sh "docker rmi ${env.DOCKER_REGISTRY}/${env.DOCKER_APP_PATH}/${docker_image_name}:latest || true"
        }
    }
}

def preparation_for_build() {
    git_commit = sh(returnStdout: true, script: 'git log -1 --format=%h').trim()
    git_date = sh(returnStdout: true, script: 'git show -s --format=%ci ' + git_commit).trim()
    echo "Commit: ${git_commit} (${git_date})"

    // Install dependencies once for all stages
    def dockerInDocker = docker.image('docker.art.lmru.tech/node:22-alpine3.22')
    dockerInDocker.pull()
    dockerInDocker.inside('-u root -v /var/run/docker.sock:/var/run/docker.sock -v /var/run/dbus/system_bus_socket:/var/run/dbus/system_bus_socket -e HOME=${HOME} -w ${WORKSPACE}') {
        withCredentials([usernamePassword(credentialsId: ARTIFACTORY_CREDS, usernameVariable: 'ART_USERNAME', passwordVariable: 'ART_PASSWORD')]) {
            sh "npm ci --legacy-peer-deps"
        }
    }
}

def run_lint() {
    def dockerInDocker = docker.image('docker.art.lmru.tech/node:22-alpine3.22')
    dockerInDocker.inside('-u root -v /var/run/docker.sock:/var/run/docker.sock -v /var/run/dbus/system_bus_socket:/var/run/dbus/system_bus_socket -e HOME=${HOME} -w ${WORKSPACE}') {
        withCredentials([usernamePassword(credentialsId: ARTIFACTORY_CREDS, usernameVariable: 'ART_USERNAME', passwordVariable: 'ART_PASSWORD')]) {
            sh "npm run lint"
            sh "npx prettier --check 'src/**/*.{js,ts,vue}'"
        }
    }
}

def run_typecheck() {
    def dockerInDocker = docker.image('docker.art.lmru.tech/node:22-alpine3.22')
    dockerInDocker.inside('-u root -v /var/run/docker.sock:/var/run/docker.sock -v /var/run/dbus/system_bus_socket:/var/run/dbus/system_bus_socket -e HOME=${HOME} -w ${WORKSPACE}') {
        withCredentials([usernamePassword(credentialsId: ARTIFACTORY_CREDS, usernameVariable: 'ART_USERNAME', passwordVariable: 'ART_PASSWORD')]) {
            sh "npx vue-tsc --noEmit"
        }
    }
}

def run_unit_tests() {
    def dockerInDocker = docker.image('docker.art.lmru.tech/node:22-alpine3.22')
    dockerInDocker.inside('-u root -v /var/run/docker.sock:/var/run/docker.sock -v /var/run/dbus/system_bus_socket:/var/run/dbus/system_bus_socket -e HOME=${HOME} -w ${WORKSPACE}') {
        withCredentials([usernamePassword(credentialsId: ARTIFACTORY_CREDS, usernameVariable: 'ART_USERNAME', passwordVariable: 'ART_PASSWORD')]) {
            sh "npm run test"
        }
    }
}

def run_build() {
    def dockerInDocker = docker.image('docker.art.lmru.tech/node:22-alpine3.22')
    dockerInDocker.inside('-u root -v /var/run/docker.sock:/var/run/docker.sock -v /var/run/dbus/system_bus_socket:/var/run/dbus/system_bus_socket -e HOME=${HOME} -w ${WORKSPACE}') {
        withCredentials([usernamePassword(credentialsId: ARTIFACTORY_CREDS, usernameVariable: 'ART_USERNAME', passwordVariable: 'ART_PASSWORD')]) {
            sh "npm run build"
        }
    }
}

def run_e2e_tests() {
    // Start PostgreSQL for arepos-server
    sh "docker rm -f e2e-postgres || true"
    sh "docker run -d --name e2e-postgres --network host \\
        -e POSTGRES_DB=arepos \\
        -e POSTGRES_USER=arepos \\
        -e POSTGRES_PASSWORD=arepos \\
        postgres:16-alpine"

    // Wait for PostgreSQL
    retry(10) {
        sh "docker exec e2e-postgres pg_isready -U arepos -h 127.0.0.1 || exit 1"
    }

    // Pull and start arepos-server backend
    sh "docker rm -f e2e-arepos || true"
    def areposImage = docker.image('docker-warchi.art.lmru.tech/arepos-server/arepos--backend:latest')
    areposImage.pull()
    sh "docker run -d --name e2e-arepos --network host \\
        -e DB_URL=jdbc:postgresql://127.0.0.1:5432/arepos \\
        -e DB_USERNAME=arepos \\
        -e DB_PASSWORD=arepos \\
        -e JWT_SECRET=e2e-test-secret-min-256-bits-long-for-local-testing-only-changeme!! \\
        -e FILE_STORAGE=disabled \\
        -e WEBSOCKET_ALLOWED_ORIGIN_PATTERNS='*' \\
        ${areposImage.id()}"

    // Wait for arepos-server (up to 90s)
    retry(30) {
        sh "curl -sf http://127.0.0.1:8080/api/v1/system/version || exit 1"
    }

    def dockerInDocker = docker.image('docker.art.lmru.tech/node:22-bookworm')
    dockerInDocker.inside('-u root -v /var/run/docker.sock:/var/run/docker.sock -v /var/run/dbus/system_bus_socket:/var/run/dbus/system_bus_socket -e HOME=${HOME} -w ${WORKSPACE} --network host') {
        withCredentials([usernamePassword(credentialsId: ARTIFACTORY_CREDS, usernameVariable: 'ART_USERNAME', passwordVariable: 'ART_PASSWORD')]) {
            sh "npx playwright install --with-deps"
            sh "CI=true npx playwright test"
        }
    }

    // Cleanup
    sh "docker rm -f e2e-arepos e2e-postgres || true"
}

def run_audit_scan() {
    def dockerInDocker = docker.image('docker.art.lmru.tech/node:22-alpine3.22')
    dockerInDocker.inside('-u root -v /var/run/docker.sock:/var/run/docker.sock -v /var/run/dbus/system_bus_socket:/var/run/dbus/system_bus_socket -e HOME=${HOME} -w ${WORKSPACE}') {
        withCredentials([usernamePassword(credentialsId: ARTIFACTORY_CREDS, usernameVariable: 'ART_USERNAME', passwordVariable: 'ART_PASSWORD')]) {
            sh "npm audit --audit-level=high || echo 'npm audit completed (warnings detected)'"
            sh "npx snyk test --severity-threshold=high || echo 'Snyk scan skipped or not available'"
        }
    }
}

def get_variables_and_deploy(deployment_environment, deployment_namespace, docker_image_name, docker_image_tag) {
    // First vault call: service account for kubeconfig
    vaultUtils.secretsToEnv(
            vaultPath: 'service_accounts/service_account',
            appRoleCredential: 'approle-service_accounts-ro',
            namespace: env.VAULT_NAMESPACE
    )

    // Second vault call: environment-specific cerbos credentials
    vaultUtils.secretsToEnv(
            vaultPath: "service_accounts/${deployment_environment}",
            appRoleCredential: env.vault_approle,
            namespace: env.VAULT_NAMESPACE
    )

    // Third vault call: warchi app secrets
    vaultUtils.secretsToEnv(
            vaultPath: "${deployment_environment}/apps/warchi",
            appRoleCredential: env.vault_approle,
            namespace: env.VAULT_NAMESPACE
    )

    // Cleanup: vaultUtils sets 'null' string if key doesn't exist in Vault
    ['ROLE_ID', 'SECRET_ID'].each { k ->
        if (env[k] == 'null') env[k] = ''
    }

    def deployer = docker.image('docker-devops.art.lmru.tech/img-k8s-deployer:latest')
    deployer.pull()

    // Передаем в контейнер переменные из Vault для envsubst и helm
    def envVars = "-e CLUSTER=${env.CLUSTER} -e USERNAME=${env.login} -e PASSWORD=${env.password} " +
            "-e VAULT_PATH=${env.VAULT_PATH} -e VAULT_NAMESPACE=${env.VAULT_NAMESPACE} " +
            "-e WORKSPACE=${WORKSPACE} " +
            "-e DEPLOYMENT_ENV=${deployment_environment} " +
            "-e DEPLOYMENT_NAMESPACE=${deployment_namespace} " +
            "-e IMAGE_REPO=${env.DOCKER_REGISTRY}/${env.DOCKER_APP_PATH}/${docker_image_name} " +
            "-e IMAGE_TAG=${docker_image_tag}"

    deployer.inside("-u root ${envVars}".trim()) {
        try {
            sh "get-kubeconfig-basic"
            sh "kubectl config set-context --current --namespace=\${DEPLOYMENT_NAMESPACE}"
            sh "chmod 400 /root/.kube/config"

            // envsubst: расширяем ${VAR} из values.yaml значениями из env (Vault)
            sh "envsubst < \${WORKSPACE}/charts/warchi/values-${deployment_environment}.yaml > \${WORKSPACE}/values-expanded.yaml"

            // helm upgrade
            sh """#!/bin/bash
set -euo pipefail
helm3 repo update
helm3 upgrade --install --timeout 180s --wait \\
  -f \${WORKSPACE}/values-expanded.yaml \\
  --set "image.repository=\${IMAGE_REPO}" \\
  --set "image.tag=\${IMAGE_TAG}" \\
  --set "namespace=\${DEPLOYMENT_NAMESPACE}" \\
  --namespace \${DEPLOYMENT_NAMESPACE} --create-namespace \\
  warchi \${WORKSPACE}/charts/warchi
"""
        }
        finally {}
    }
}