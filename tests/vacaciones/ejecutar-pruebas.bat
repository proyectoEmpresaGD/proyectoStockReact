@echo off
setlocal
cd /d "%~dp0\..\.."
echo.
echo =============================================
echo   PRUEBAS UNITARIAS - MODULO VACACIONES

echo =============================================
echo.
node --test tests\vacaciones\vacationWorkSchedule.test.js tests\vacaciones\vacationDateRules.test.js tests\vacaciones\vacationCalendarEvents.test.js
echo.
if errorlevel 1 (
  echo [ERROR] Hay pruebas que no han pasado.
) else (
  echo [OK] Todas las pruebas han pasado correctamente.
)
echo.
pause
