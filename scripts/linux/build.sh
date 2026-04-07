#!/bin/bash

npm install

cd modules
for D in `find . -maxdepth 1 -not -path "." -not -path "./.*" -type d`
do
    cd $D
    echo $D
    npm run build
    cd ..
done
cd ..

cd packages
for D in `find . -maxdepth 1 -not -path "." -not -path "./.*" -type d`
do
    cd $D
    echo $D
    npm run build
    cd ..
done
cd ..

cd apps
for D in `find . -maxdepth 1 -not -path "." -not -path "./.*" -type d`
do
    cd $D
    echo $D
    npm run build
    cd ..
done
cd ..
