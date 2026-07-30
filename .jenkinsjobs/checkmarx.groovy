def resolveCxBranch() {
    def branch = (env.CHANGE_BRANCH ?: env.BRANCH_NAME ?: env.GIT_BRANCH ?: env.gitlabBranch ?: params.OVERRIDE_BRANCH ?: '')
        .replaceFirst('^origin/', '')
        .replaceFirst('^refs/heads/', '')
        .trim()
    if (!branch) {
        branch = sh(returnStdout: true, script: 'git rev-parse --abbrev-ref HEAD').trim()
    }
    if (branch == 'HEAD' || !branch) {
        branch = sh(returnStdout: true, script: 'git describe --tags --exact-match 2>/dev/null || git rev-parse --short HEAD').trim()
    }
    if (!branch) {
        branch = 'master'
    }
    return branch
}

def runCheckmarxScan() {
    def branch = resolveCxBranch()
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
    checkmarxUtils.deleteCXProject([defaultBranchName: resolveCxBranch()])
}

return this
