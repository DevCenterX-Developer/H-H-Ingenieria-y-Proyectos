# H&H Ingeniería y Proyectos — Aula virtual

Esta plataforma está pensada para ofrecer cursos de dibujo mecánico, AutoCAD y diseño técnico en un entorno virtual con:

- sesiones y materiales de clase
- recursos descargables y enlaces de video
- evaluaciones y seguimiento del aprendizaje

## Configuración

1. Crear un proyecto en Firebase.
2. Activar Authentication con correo y contraseña.
3. Activar Firestore Database.
4. Copiar las credenciales en config.json.
5. Abrir index.html desde un servidor local o publicarla en hosting.

## Roles

- Estudiante: accede a cursos, recursos y evaluaciones.
- Instructor: crea cursos, publica materiales y gestiona evaluaciones.

Código de registro de instructor por defecto: HHPROYECTOS

## Estructura

- /alumnos: panel del estudiante
- /profesores: panel del instructor
- /assets: utilidades compartidas
- index.html: acceso inicial
- style.css: estilos generales
- script.js: autenticación
- config.json: configuración del sistema
