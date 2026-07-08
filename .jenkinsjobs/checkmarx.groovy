def runCheckmarxScan() {
    def branch = sh(returnStdout: true, script: 'git rev-parse --abbrev-ref HEAD').trim()
    if (branch == 'HEAD') {
        branch = sh(returnStdout: true, script: 'git describe --tags --exact-match 2>/dev/null || git rev-parse HEAD').trim()
    }
    echo "Checkmarx scanning workspace @ ${branch}"
    checkmarxUtils.runCheckmarxScan_ZeroLicense(
        getCXReport: true,
        defaultBranchName: branch,
    )
}

def sendCxReportToSonar(String projectName) {
    checkmarxUtils.sendCXReportSonar(
        projectName: projectName,
        projectType: "sonar"
    )
}

def deleteCxProject() {
    checkmarxUtils.deleteCXProject[:]
}

return this
