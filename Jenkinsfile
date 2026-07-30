#!/usr/bin/env groovy
@Library(['common-utils']) _

// Thin stub: full LMRU CI lives in lmru-warchi-deploy.
def LMRU_DEPLOY_REPO = 'git@gitlab.lmru.tech:products/warchi/lmru-warchi-deploy.git'
def LMRU_DEPLOY_BRANCH = 'master'
def LMRU_SERVICE = 'warchi'

def pipelineClosure
node('dockerhost') {
    checkout scm

    dir('_lmru_deploy') {
        deleteDir()
        git branch: LMRU_DEPLOY_BRANCH,
                credentialsId: 'lm-sa-warchi',
                url: LMRU_DEPLOY_REPO
    }

    def deployRoot = "${pwd()}/_lmru_deploy"
    env.LMRU_DEPLOY_DIR = deployRoot
    env.LMRU_SERVICE = LMRU_SERVICE

    sh "rm -rf .jenkinsjobs && cp -a '${deployRoot}/jenkins/warchi' .jenkinsjobs"

    pipelineClosure = load "${deployRoot}/pipelines/warchi/pipeline.groovy"
}
pipelineClosure()
