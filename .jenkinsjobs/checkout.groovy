def configure_environment(def scm, def overrideBranch, def overrideTag, def overrideEnv) {
    // Manual override takes precedence; else auto-detect from GitLab webhook
    def tag = overrideTag ?: env.gitlabTag ?: env.TAG ?: ''
    def branch = overrideBranch ?: env.gitlabBranch ?: env.BRANCH_NAME ?: ''
    def is_tag_build = (tag != '')
    env.is_tag_build = String.valueOf(is_tag_build)

    if (!is_tag_build && (branch == '' || branch == null)) {
        branch = 'develop'
    }

    if (is_tag_build) {
        echo "=== TAG RELEASE BUILD: ${tag} → prod ==="
        checkout([
                $class: 'GitSCM',
                branches: [[name: "refs/tags/${tag}"]],
                userRemoteConfigs: [[
                                            url: scm.userRemoteConfigs[0].url,
                                            credentialsId: scm.userRemoteConfigs[0].credentialsId,
                                            refspec: '+refs/heads/*:refs/remotes/origin/* +refs/tags/*:refs/tags/*'
                                    ]],
                extensions: scm.gitTool
        ])
        env.CLUSTER = 'os1c-polaris-prod-01'
        env.DOCKER_IMAGE = 'warchi--frontend'
        env.DOCKER_IMAGE_TAG = tag.replaceFirst('^v', '')
        env.deployment_environment = 'prod'
        env.deployment_namespace = 'warchi-prod'
        env.image_days_retention = '365'
        env.VAULT_PATH = 'prod'
        env.vault_approle = 'approle-prod-ro'
        env.AREPOS_UPSTREAM = 'arepos-server.warchi-prod.svc.cluster.local'
        env.INGRESS_HOST = 'warchi.lmru.tech'
        env.skip_docker_deploy = 'false'
    } else if (branch == 'master') {
        echo "=== MASTER BRANCH BUILD → warchi-preprod ==="
        checkout([
                $class: 'GitSCM',
                branches: [[name: "${branch}"]],
                userRemoteConfigs: scm.userRemoteConfigs,
                extensions: scm.extensions,
                gitTool: scm.gitTool
        ])
        env.DOCKER_IMAGE = 'warchi--frontend'
        env.DOCKER_IMAGE_TAG = UUID.randomUUID().toString()
        env.deployment_environment = 'preprod'
        env.deployment_namespace = 'warchi-preprod'
        env.CLUSTER = 'os1c-polaris-stage-01'
        env.image_days_retention = '180'
        env.VAULT_PATH = 'preprod'
        env.vault_approle = 'approle-preprod-ro'
        env.AREPOS_UPSTREAM = 'arepos-server.warchi-preprod.svc.cluster.local'
        env.INGRESS_HOST = "warchi-preprod-${env.CLUSTER}.apps.lmru.tech"
        env.skip_docker_deploy = 'false'
    } else if (branch == 'develop') {
        echo "=== DEVELOP BRANCH BUILD → dev ==="
        checkout([
                $class: 'GitSCM',
                branches: [[name: "${branch}"]],
                userRemoteConfigs: scm.userRemoteConfigs,
                extensions: scm.extensions,
                gitTool: scm.gitTool
        ])
        def BRANCH = branch.toLowerCase().replace('origin/', '').replaceAll('/','-')
        def version_suffix = "-${BRANCH}"
        env.DOCKER_IMAGE = "warchi--frontend${version_suffix}"
        env.DOCKER_IMAGE_TAG = UUID.randomUUID().toString()
        env.deployment_environment = 'dev'
        env.deployment_namespace = 'warchi-dev'
        env.CLUSTER = 'os1c-polaris-stage-01'
        env.image_days_retention = '7'
        env.VAULT_PATH = 'test'
        env.vault_approle = 'approle-test-ro'
        env.AREPOS_UPSTREAM = 'arepos-server.warchi-dev.svc.cluster.local'
        env.INGRESS_HOST = "warchi-dev-${env.CLUSTER}.apps.lmru.tech"
        env.skip_docker_deploy = 'false'
    } else {
        echo "=== BRANCH BUILD: ${branch} (test only, no deploy) ==="
        checkout([
                $class: 'GitSCM',
                branches: [[name: "${branch}"]],
                userRemoteConfigs: scm.userRemoteConfigs,
                extensions: scm.extensions,
                gitTool: scm.gitTool
        ])
        env.skip_docker_deploy = 'true'
    }

    // Manual env override (for testing arbitrary branches)
    if (overrideEnv && !is_tag_build) {
        echo "=== OVERRIDING deploy env: ${env.deployment_environment} → ${overrideEnv} ==="
        def envName = overrideEnv.toLowerCase()
        env.deployment_environment = envName
        env.deployment_namespace = "warchi-${envName}"
        env.AREPOS_UPSTREAM = "arepos-server.warchi-${envName}.svc.cluster.local"
        env.INGRESS_HOST = "warchi-${envName}-${env.CLUSTER}.apps.lmru.tech"
        env.skip_docker_deploy = 'false'

        if (envName == 'prod') {
            env.CLUSTER = 'os1c-polaris-prod-01'
            env.VAULT_PATH = 'prod'
            env.vault_approle = 'approle-prod-ro'
        } else if (envName == 'preprod') {
            env.VAULT_PATH = 'preprod'
            env.vault_approle = 'approle-preprod-ro'
        } else {
            env.VAULT_PATH = 'test'
            env.vault_approle = 'approle-test-ro'
        }
    }

    echo "Image: ${env.DOCKER_REGISTRY}/${env.DOCKER_APP_PATH}/${env.DOCKER_IMAGE}:${env.DOCKER_IMAGE_TAG}"
    echo "Deploy → ${env.deployment_namespace} (${env.deployment_environment}, cluster=${env.CLUSTER}, approle=${env.vault_approle})"
}

return this
