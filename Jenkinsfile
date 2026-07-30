#!/usr/bin/env groovy
@Library(['common-utils']) _

// Thin stub: full LMRU CI lives in lmru-warchi-deploy.
// HTTPS avoids Jenkins agent "Host key verification failed" on SSH to gitlab.lmru.tech.
def LMRU_DEPLOY_REPO = 'https://gitlab.lmru.tech/products/warchi/lmru-warchi-deploy.git'
def LMRU_DEPLOY_BRANCH = 'master'
def LMRU_SERVICE = 'warchi'

def pipelineClosure
node('dockerhost') {
    checkout scm

    dir('_lmru_deploy') {
        deleteDir()
        checkout([
                $class           : 'GitSCM',
                branches         : [[name: LMRU_DEPLOY_BRANCH]],
                userRemoteConfigs: [[
                                            url          : LMRU_DEPLOY_REPO,
                                            credentialsId: 'lm-sa-warchi'
                                    ]],
                extensions       : [[$class: 'CloneOption', shallow: true, depth: 1, noTags: true]]
        ])
    }

    def deployRoot = "${pwd()}/_lmru_deploy"
    env.LMRU_DEPLOY_DIR = deployRoot
    env.LMRU_SERVICE = LMRU_SERVICE

    sh "rm -rf .jenkinsjobs && cp -a '${deployRoot}/jenkins/warchi' .jenkinsjobs"

    pipelineClosure = load "${deployRoot}/pipelines/warchi/pipeline.groovy"
}
pipelineClosure()
