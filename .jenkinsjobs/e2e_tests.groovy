def run_e2e_tests(String artifactoryCreds) {
    sh "docker rm -f e2e-postgres || true"
    sh """docker run -d --name e2e-postgres --network host \
        -e POSTGRES_DB=arepos \
        -e POSTGRES_USER=arepos \
        -e POSTGRES_PASSWORD=arepos \
        postgres:16-alpine"""

    retry(10) {
        sh "docker exec e2e-postgres pg_isready -U arepos -h 127.0.0.1 || exit 1"
    }

    sh "docker rm -f e2e-arepos || true"
    def areposImage = docker.image('docker-warchi.art.lmru.tech/arepos-server/arepos--backend:latest')
    areposImage.pull()
    sh """docker run -d --name e2e-arepos --network host \
        -e DB_URL=jdbc:postgresql://127.0.0.1:5432/arepos \
        -e DB_USERNAME=arepos \
        -e DB_PASSWORD=arepos \
        -e JWT_SECRET=e2e-test-secret-min-256-bits-long-for-local-testing-only-changeme!! \
        -e FILE_STORAGE=disabled \
        -e WEBSOCKET_ALLOWED_ORIGIN_PATTERNS='*' \
        ${areposImage.id()}"""

    retry(30) {
        sh "curl -sf http://127.0.0.1:8080/api/v1/system/version || exit 1"
    }

    def nodeImage = docker.image('docker.art.lmru.tech/node:22-bookworm')
    nodeImage.inside('-u root -v /var/run/docker.sock:/var/run/docker.sock -v /var/run/dbus/system_bus_socket:/var/run/dbus/system_bus_socket -e HOME=${HOME} -w ${WORKSPACE} --network host') {
        withCredentials([usernamePassword(credentialsId: artifactoryCreds, usernameVariable: 'ART_USERNAME', passwordVariable: 'ART_PASSWORD')]) {
            sh "npx playwright install --with-deps"
            sh "CI=true npx playwright test"
        }
    }

    sh "docker rm -f e2e-arepos e2e-postgres || true"
}

return this
