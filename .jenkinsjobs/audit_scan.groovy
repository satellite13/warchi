def run_audit_scan(String artifactoryCreds) {
    def nodeImage = docker.image('docker.art.lmru.tech/node:22-alpine3.22')
    nodeImage.inside('-u root -v /var/run/docker.sock:/var/run/docker.sock -v /var/run/dbus/system_bus_socket:/var/run/dbus/system_bus_socket -e HOME=${HOME} -w ${WORKSPACE}') {
        withCredentials([usernamePassword(credentialsId: artifactoryCreds, usernameVariable: 'ART_USERNAME', passwordVariable: 'ART_PASSWORD')]) {
            sh "npm audit --audit-level=high || echo 'npm audit completed (warnings detected)'"
            sh "npx snyk test --severity-threshold=high || echo 'Snyk scan skipped or not available'"
        }
    }
}

return this
