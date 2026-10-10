' One-click launcher with a small console window.
' Double-click this file (or the .bat) to start the viewer.
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = dir
' 1 = normal window so the user can close it to quit
sh.Run "cmd /c ""Start WARDOGS Viewer.bat""", 1, False
