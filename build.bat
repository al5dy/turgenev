SET version=1.0
SET plugin=turgenev

call npm run build

for %%a in ("build" "includes" "languages") do (xcopy /s /d /i /y "%%~a" ".\%plugin%\%%~a" )
for %%a in (".\%plugin%.php" ".\readme.txt") do (xcopy /d /i /y "%%~a" ".\%plugin%")
7z a -tzip -mx9 %plugin%.%version%.zip %plugin%
rd /S /Q .\%plugin%
del %plugin%.%version%.zip

:: Wordpress SVN
::SLEEP 1
@RD /S /Q ".\wordpress\trunk"
@RD /S /Q ".\wordpress\assets"
for %%a in ("build" "includes" "languages") do (xcopy /s /d /i /y "%%~a" ".\wordpress\trunk\%%~a" )
for %%a in (".\%plugin%.php" ".\readme.txt") do (xcopy /d /i /y "%%~a" ".\wordpress\trunk")
xcopy /s /y .\src\assets\*.* .\wordpress\assets\
