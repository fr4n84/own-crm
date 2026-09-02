Vas a realizar un seed basandote en mi archivo csv que contiene todos los registros.

La base de datos contiene esta estructura en sus columnas   {
    "id": "4604f3e3-fb6d-4854-8c9d-f78258670c05",
    "name": "Gerson Wunsch",
    "email": "lead-009@test.com",
    "phone": "1-829-499-0656 x58352",
    "state": "sin asignar",
    "caller_id": "DhGz20ufNH0cOBNT4O3xBGDFuG7gAbpj",
    "closer_id": null,
    "response": "sin asignar",
    "feedback": "sin asignar",
    "created_at": "2026-08-06 18:22:25.011907",
    "updated_at": "2026-08-17 18:26:12.458",
    "questions": [],
    "type": "vsl",
    "pool_status": "new",
    "no_contact_impact_count": 0,
    "source": null,
    "campaign": null,
    "ad": null,
    "creative": null,
    "acquisition_angle": null
  }

  Por lo que el script debe recorrer todos los valores del archivo del csv y guardarlo como registro en mi basa de datos la tabla leads.

  Pero existen varios incovenientes, uno de ellos son los usuarios, en la columna caller_id guarda la relacion con el usuario y el el csv está escrito con simples nombres como:

  Fran
  Ramon
  Richard 
  Anna

  EL segundo inconveniente debo crear una nueva columna en la tabla para guardar el valor utm_content Pero por ahora ese valor estará oculto quiere decir solo vivirá en la base de datos por lo que hay que añadirlo y del documento csv solo me interesa guardar los siguientes datos, para alientar los leads

  Fecha,Nombre,Correo,Tel,,Caller,Contactado,Respuesta,3 impactos,ULTIMO CONTACTO,FEEDABCK,utm_content

  Para que solo guardes el contenido de mi csv que se encuentre en esas columnas en mi base de datos en la tabla leeds