#!/bin/bash

# Ensure npm is installed
if ! command -v npm &> /dev/null
then
    echo "npm could not be found"
    exit 1
fi

# Build function
build_workspace() {
    local category=$1
    if [ -d "$category" ]; then
        echo "Processing category: $category"
        for d in "$category"/*; do
            if [ -d "$d" ] && [ -f "$d/package.json" ]; then
                echo "Building $(basename "$d")..."
                (cd "$d" && npm install && npm run build)
                if [ $? -ne 0 ]; then
                    echo "Build failed in $d"
                    exit 1
                fi
            fi
        done
    fi
}

# Run builds
build_workspace "modules"
build_workspace "packages"
build_workspace "apps"

echo "Build process completed successfully!"
