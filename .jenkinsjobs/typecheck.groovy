def run_typecheck(String artifactoryCreds) {
    def nodeImage = docker.image('docker.art.lmru.tech/node:22-alpine3.22')
    nodeImage.inside('-u root -v /var/run/docker.sock:/var/run/docker.sock -v /var/run/dbus/system_bus_socket:/var/run/dbus/system_bus_socket -e HOME=${HOME} -w ${WORKSPACE}') {
        withCredentials([usernamePassword(credentialsId: artifactoryCreds, usernameVariable: 'ART_USERNAME', passwordVariable: 'ART_PASSWORD')]) {
            sh "npx vue-tsc --noEmit"
        }
    }
}

return this
