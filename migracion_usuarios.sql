USE tienda_virtual_practica;
GO

IF COL_LENGTH('dbo.Usuarios', 'apellidos') IS NULL
BEGIN
    ALTER TABLE dbo.Usuarios
    ADD apellidos VARCHAR(50) NOT NULL
        CONSTRAINT DF_Usuarios_apellidos DEFAULT ('') WITH VALUES;
END;
GO

IF COL_LENGTH('dbo.Usuarios', 'nombres') IS NULL
BEGIN
    ALTER TABLE dbo.Usuarios
    ADD nombres VARCHAR(50) NOT NULL
        CONSTRAINT DF_Usuarios_nombres DEFAULT ('') WITH VALUES;
END;
GO

-- Conserva el nombre que ya tenían los registros en el campo nombres.
UPDATE dbo.Usuarios
SET nombres = LEFT(nombre, 50)
WHERE nombres = '' AND nombre IS NOT NULL;
GO
