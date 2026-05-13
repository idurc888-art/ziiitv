#!/bin/bash
set -e

TIZEN=~/tizen-studio/tools/ide/bin/tizen
SDB=~/tizen-studio/tools/sdb
TV=QN55Q65CAGXZD
CERT=zi01

echo "▶ Build Vite..."
npm run build

echo "▶ Empacotando..."
$TIZEN package -t wgt -s $CERT -- dist

echo "▶ Conectando TV dos pais (192.168.1.60)..."
$SDB connect 192.168.1.60:26101

echo "▶ Instalando..."
$TIZEN install -n dist/ziiiTV.wgt -t $TV

echo "✅ Deploy TV dos pais concluído!"
