def preparation_for_build(String artifactoryCreds) {
    def gitResult = [:]
    gitResult.git_commit = sh(returnStdout: true, script: 'git log -1 --format=%h').trim()
    gitResult.git_date = sh(returnStdout: true, script: 'git show -s --format=%ci ' + gitResult.git_commit).trim()
    echo "Commit: ${gitResult.git_commit} (${gitResult.git_date})"

    def nodeImage = docker.image('docker.art.lmru.tech/node:22-alpine3.22')
    nodeImage.pull()
    nodeImage.inside('-u root -v /var/run/docker.sock:/var/run/docker.sock -v /var/run/dbus/system_bus_socket:/var/run/dbus/system_bus_socket -e HOME=${HOME} -w ${WORKSPACE}') {
        withCredentials([usernamePassword(credentialsId: artifactoryCreds, usernameVariable: 'ART_USERNAME', passwordVariable: 'ART_PASSWORD')]) {
            sh "npm ci --legacy-peer-deps"
        }
    }
    return gitResult
}

return this
