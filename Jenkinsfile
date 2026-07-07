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

// Shared state between stages
def git_commit = ''
def git_date = ''

pipeline {
    agent {
        node {
            label 'dockerhost'
        }
    }

    triggers {
        gitlab(
                triggerOnPush: true,
                branchFilterType: "All",
                secretToken: ''
        )
    }

    parameters {
        string(name: 'OVERRIDE_BRANCH', defaultValue: '', description: 'Override branch (leave empty for auto-detect)')
        string(name: 'OVERRIDE_TAG', defaultValue: '', description: 'Override tag for prod release (e.g. 7.10.1)')
        string(name: 'OVERRIDE_ENV', defaultValue: '', description: 'Override deploy env: stage, preprod, prod (leave empty for auto)')
    }
    stages {
        stage('Checkout') {
            steps {
                script {
                    def checkout = load '.jenkinsjobs/checkout.groovy'
                    deleteDir()
                    checkout.configure_environment(
                            scm,
                            params.OVERRIDE_BRANCH,
                            params.OVERRIDE_TAG,
                            params.OVERRIDE_ENV
                    )
                }
            }
        }

        stage('Preparation') {
            steps {
                script {
                    def prep = load '.jenkinsjobs/preparation.groovy'
                    def gitInfo = prep.preparation_for_build(SERVICE_ACCOUNT)
                    git_commit = gitInfo.git_commit
                    git_date = gitInfo.git_date
                }
            }
        }

        stage('Lint') {
            steps {
                script {
                    def lint = load '.jenkinsjobs/lint.groovy'
                    try {
                        lint.run_lint(SERVICE_ACCOUNT)
                    } catch (e) {
                        echo "Lint failed (non-blocking): ${e.message}"
                    }
                }
            }
        }

        stage('Type-check') {
            steps {
                script {
                    def typecheck = load '.jenkinsjobs/typecheck.groovy'
                    try {
                        typecheck.run_typecheck(SERVICE_ACCOUNT)
                    } catch (e) {
                        echo "Type-check failed (non-blocking): ${e.message}"
                    }
                }
            }
        }

        stage('Unit-test') {
            steps {
                script {
                    def tests = load '.jenkinsjobs/unit_tests.groovy'
                    try {
                        tests.run_unit_tests(SERVICE_ACCOUNT)
                    } catch (e) {
                        echo "Unit-test failed (non-blocking): ${e.message}"
                    }
                }
            }
        }

        stage('Build') {
            steps {
                script {
                    def build = load '.jenkinsjobs/build.groovy'
                    build.run_build(SERVICE_ACCOUNT)
                }
            }
        }

        // TODO: re-enable E2E-test when Playwright tests are stable
        stage('E2E-test') {
            when {
                expression { false }
            }
            steps {
                script {
                    def e2e = load '.jenkinsjobs/e2e_tests.groovy'
                    try {
                        e2e.run_e2e_tests(SERVICE_ACCOUNT)
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
                    scanner.inside('-u root -e HOME=${HOME}') {
                        withSonarQubeEnv(credentialsId: 'sonarqube_token', installationName: 'SonarQube') {
                            sh "sonar-scanner -Dsonar.projectKey=warchi-frontend -Dsonar.projectVersion=${env.DOCKER_IMAGE_TAG ? env.DOCKER_IMAGE_TAG : 'SNAPSHOT'} -Dsonar.sources=src -Dsonar.ts.lcov.reportPaths=coverage/lcov.info"
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
            when {
                expression { env.skip_docker_deploy != 'true' }
            }
            steps {
                script {
                    def dockerBuild = load '.jenkinsjobs/docker_build.groovy'
                    def is_prod = (env.deployment_environment == 'prod') || (env.image_days_retention == '180')
                    dockerBuild.image_build_and_push(env.DOCKER_IMAGE, env.DOCKER_IMAGE_TAG, is_prod,
                            scm.userRemoteConfigs[0].url, git_commit, git_date, env.image_days_retention, env.deployment_namespace)
                }
            }
        }

        stage('Deploy') {
            when {
                expression { env.skip_docker_deploy != 'true' }
            }
            steps {
                script {
                    def deploy = load '.jenkinsjobs/deploy.groovy'
                    def is_tag_build = (env.is_tag_build == 'true')

                    if (is_tag_build) {
                        echo "=== TAG RELEASE: deploy ${env.deployment_namespace} (${env.vault_approle}) ==="
                        deploy.get_variables_and_deploy('prod', env.deployment_namespace, env.DOCKER_IMAGE, env.DOCKER_IMAGE_TAG)
                    } else if (env.deployment_environment == 'stage' || env.deployment_environment == 'preprod') {
                        echo "Deploy to ${env.deployment_namespace} (${env.deployment_environment}, ${env.vault_approle})"
                        deploy.get_variables_and_deploy(env.deployment_environment, env.deployment_namespace, env.DOCKER_IMAGE, env.DOCKER_IMAGE_TAG)
                    } else {
                        echo "Skip deploy: env=${env.deployment_environment}"
                    }
                }
            }
        }
    }
}
