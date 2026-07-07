def get_variables_and_deploy(String deployment_environment, String deployment_namespace,
                             String docker_image_name, String docker_image_tag) {
    vaultUtils.secretsToEnv(
            vaultPath: 'service_accounts/service_account',
            appRoleCredential: 'approle-service_accounts-ro',
            namespace: env.VAULT_NAMESPACE
    )

    vaultUtils.secretsToEnv(
            vaultPath: "service_accounts/${deployment_environment}",
            appRoleCredential: env.vault_approle,
            namespace: env.VAULT_NAMESPACE
    )

    vaultUtils.secretsToEnv(
            vaultPath: "${deployment_environment}/apps/warchi",
            appRoleCredential: env.vault_approle,
            namespace: env.VAULT_NAMESPACE
    )

    ['ROLE_ID', 'SECRET_ID'].each { k ->
        if (env[k] == 'null') env[k] = ''
    }

    def deployer = docker.image('docker-devops.art.lmru.tech/img-k8s-deployer:latest')
    deployer.pull()

    def envVars = "-e CLUSTER=${env.CLUSTER} -e USERNAME=${env.login} -e PASSWORD=${env.password} " +
            "-e VAULT_PATH=${env.VAULT_PATH} -e VAULT_NAMESPACE=${env.VAULT_NAMESPACE} " +
            "-e WORKSPACE=${WORKSPACE} " +
            "-e DEPLOYMENT_ENV=${deployment_environment} " +
            "-e DEPLOYMENT_NAMESPACE=${deployment_namespace} " +
            "-e IMAGE_REPO=${env.DOCKER_REGISTRY}/${env.DOCKER_APP_PATH}/${docker_image_name} " +
            "-e IMAGE_TAG=${docker_image_tag} " +
            "-e INGRESS_HOST=${env.INGRESS_HOST}"

    deployer.inside("-u root ${envVars}".trim()) {
        try {
            sh "get-kubeconfig-basic"
            sh "kubectl config set-context --current --namespace=\${DEPLOYMENT_NAMESPACE}"
            sh "chmod 400 /root/.kube/config"

            sh "envsubst < \${WORKSPACE}/charts/warchi/values-${deployment_environment}.yaml > \${WORKSPACE}/values-expanded.yaml"

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

return this
