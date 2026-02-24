#!/bin/sh
cd charts && helm lint ./warchi && helm template ./warchi --values warchi/values.yaml | kubectl apply --dry-run=client -f - && helm install warchi-0.0.12 ./warchi --dry-run=client -n arch --debug --values warchi/values.yaml
