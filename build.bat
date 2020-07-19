SET version=1.0
SET plugin=turgenev
for %%a in ("build" "includes" "languages") do (xcopy /s /d /i /y "%%~a" ".\%plugin%\%%~a" )
for %%a in (".\%plugin%.php" ".\readme.txt") do (xcopy /d /i /y "%%~a" ".\%plugin%")
7z a -tzip -mx9 %plugin%.%version%.zip %plugin%
rd /S /Q .\%plugin%
del %plugin%.%version%.zip

:: Wordpress SVN
::SLEEP 1
for %%a in ("build" "includes" "languages") do (xcopy /s /d /i /y "%%~a" ".\wordpress\trunk\%%~a" )
for %%a in (".\%plugin%.php" ".\readme.txt") do (xcopy /d /i /y "%%~a" ".\wordpress\trunk")
xcopy /s /y .\src\assets\*.* .\wordpress\assets\
