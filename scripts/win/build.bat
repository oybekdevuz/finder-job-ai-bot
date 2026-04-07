@echo off

call npm install

cd modules
for /d %%D in (*) do (
    if not "%%D"=="." if not "%%D"==".." (
        cd "%%D"
        echo %%D
        call npm run build
        cd ..
    )
)
cd ..

cd packages
for /d %%D in (*) do (
    if not "%%D"=="." if not "%%D"==".." (
        cd "%%D"
        echo %%D
        call npm run build
        cd ..
    )
)
cd ..

cd apps
for /d %%D in (*) do (
    if not "%%D"=="." if not "%%D"==".." (
        cd "%%D"
        echo %%D
        call npm run build
        cd ..
    )
)
cd ..
