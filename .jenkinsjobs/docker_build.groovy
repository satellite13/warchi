def image_build_and_push(String docker_image_name, String docker_image_tag, boolean is_prod,
                         String git_repo, String git_commit, String git_date,
                         String image_days_retention, String deployment_namespace) {
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

return this
