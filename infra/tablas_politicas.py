"""Tablas de los PDF reconstruidas a mano (auditoria T12): pdftotext las desalinea y un
fragmento con la tabla revuelta citaria bien la seccion y diria un dato falso.

Cada entrada: (linea donde EMPIEZA la region revuelta, linea donde TERMINA -exclusiva-, markdown).
Se transcribieron leyendo el -layout y el PDF; pdf_a_markdown.py las aplica al final.
"""

TABLAS = {
 "faq_gerentes_de_tienda": [
  ("Priori Cuándo aplica", "### P21.", """
| Prioridad | Cuándo aplica | Tiempo de primera respuesta | Tiempo objetivo de solución |
|---|---|---|---|
| Baja | Incidencia que no afecta la venta ni la operación (un handheld de varios, una impresora de oficina). | 8 horas hábiles | 5 días hábiles |
| Media | Afecta parcialmente la operación pero existe alternativa (una caja sin impresora, una báscula de varias). | 4 horas hábiles | 2 días hábiles |
| Alta | Afecta de forma importante la venta o la seguridad (varias cajas fuera, terminal bancaria general, remodelación mayor). | 1 hora | 8 horas |
| Crítica | Detiene la operación de la tienda o pone en riesgo el producto o a las personas (servidor caído, sin enlace de datos, planta de emergencia que no arranca, cámara de refrigeración fuera). | 15 minutos | 4 horas |
"""),
  ("Versi Fecha", None, """
| Versión | Fecha | Descripción del cambio | Autorizó |
|---|---|---|---|
| 1.0 | 1 de agosto de 2023 | Emisión inicial con 15 preguntas. | Dirección de Operaciones de Tienda |
| 1.1 | 15 de febrero de 2024 | Se agregan preguntas sobre pedidos en línea y devoluciones sin ticket. | Dirección de Operaciones de Tienda |
| 1.2 | 1 de agosto de 2024 | Se agrega la tabla de prioridades de la Mesa de Servicio. | Dirección de Operaciones de Tienda |
| 1.3 | 1 de marzo de 2025 | Se actualizan referencias a la Política de mermas y caducidad versión 3.2. | Dirección de Operaciones de Tienda |
| 1.4 | 12 de enero de 2026 | Se agregan preguntas sobre remodelaciones, datos personales de colaboradores y ausencias; total de 25 preguntas. | Dirección de Operaciones de Tienda |
"""),
 ],
 "manual_apertura_y_cierre_tienda": [
  ("Hora 5:30", "### 3.1", """
| Hora | Actividad | Responsable |
|---|---|---|
| 5:30 | Llegada del Gerente en turno y del Vigilante; desactivación de alarma con clave personal; registro de hora en bitácora. | Gerente en turno |
| 5:35 | Recorrido perimetral exterior e interior: puertas, cortinas, cristales, señales de intrusión o daño. | Vigilante de turno |
| 5:45 | Encendido de tableros eléctricos de iluminación de piso de venta y bodega; verificación de que no existan disparos de pastillas. | Encargado de Mantenimiento |
| 5:50 | Lectura y registro de temperaturas de cámaras de refrigeración y congelación y de muebles refrigerados de piso de venta. | Supervisor de Perecederos |
| 6:00 | Apertura de andén de recepción; verificación de citas de proveedores del día. | Jefe de Recepción |
| 6:00 | Ingreso del personal operativo por la puerta de empleados; registro de asistencia en reloj checador. | Vigilante de turno |
| 6:10 | Retiro de producto caducado o próximo a vencer conforme a la Política de mermas y caducidad (POL-OPS-014); revisión de fechas en lácteos. | Supervisor de Perecederos |
| 6:15 | Encendido de servidores de tienda, terminales de punto de venta, básculas e impresoras de caja; prueba de impresión en cada caja. | Jefe de Cajas |
| 6:30 | Apertura de la caja fuerte con doble llave (Gerente y Jefe de Cajas); conteo del fondo fijo y armado de cajones de cambio. | Jefe de Cajas y Gerente en turno |
| 6:40 | Surtido y frenteo de anaqueles prioritarios: pan, tortilla, lácteos, frutas y verduras. | Encargados de departamento |
| 6:45 | Limpieza de pasillos, sanitarios y área de cajas; colocación de tapetes y señalización de piso mojado si aplica. | Personal de limpieza |
| 6:50 | Verificación de precios exhibidos contra promociones vigentes del día; colocación de material promocional. | Jefe de Abarrotes |
| 6:55 | Reunión breve de arranque de turno (cinco minutos): metas del día, promociones, incidencias pendientes. | Gerente en turno |
| 7:00 | Apertura de puertas al público; registro de hora de apertura en bitácora. | Gerente en turno |
"""),
  ("Hora 21:30", "## 6. Arqueo", """
| Hora | Actividad | Responsable |
|---|---|---|
| 21:30 | Aviso por voceo de cierre en treinta minutos; se dejan de recibir clientes en el estacionamiento a las 21:50. | Gerente en turno |
| 21:45 | Cierre escalonado de cajas: se mantienen abiertas como mínimo dos cajas hasta que salga el último cliente. | Jefe de Cajas |
| 22:00 | Cierre de puertas al público; recorrido de piso de venta y sanitarios para confirmar que no queden clientes. | Vigilante de turno |
| 22:05 | Retiro de producto perecedero de exhibición abierta (panadería, comida preparada) y registro de merma en SIGMA. | Supervisor de Perecederos |
| 22:10 | Arqueo de cada caja conforme a la sección 6; entrega de sobres a caja fuerte. | Jefe de Cajas |
| 22:15 | Lectura y registro de temperaturas de cámaras y muebles refrigerados; verificación de cortinas nocturnas en muebles abiertos. | Supervisor de Perecederos |
| 22:20 | Frenteo final de anaqueles y limpieza de piso de venta. | Encargados de departamento |
| 22:30 | Apagado de equipos no esenciales: iluminación de piso de venta al 30 %, básculas, terminales de punto de venta (los servidores permanecen encendidos para el respaldo nocturno). | Jefe de Cajas y Encargado de Mantenimiento |
| 22:40 | Conciliación del arqueo consolidado contra el reporte de ventas del sistema; firma de la bitácora del día. | Gerente en turno |
| 22:45 | Salida del personal por la puerta de empleados con revisión de pertenencias conforme al Reglamento Interior de Trabajo. | Vigilante de turno |
| 22:55 | Recorrido final de seguridad: puertas de andén, bodega, cuarto de máquinas y oficinas cerradas con llave. | Vigilante de turno y Gerente en turno |
| 23:00 | Activación de la alarma con clave personal del Gerente en turno; registro de hora en bitácora. | Gerente en turno |
"""),
  ("Diferencia por caja", "### 6.3", """
| Diferencia por caja | Clasificación | Acción |
|---|---|---|
| Hasta 20.00 pesos | Tolerable | Se registra; no requiere acción adicional. |
| De 20.01 a 200.00 pesos | Menor | Se registra y se comenta con el cajero; tres eventos en un mes generan plan de mejora. |
| De 200.01 a 1,000.00 pesos | Mayor | Se registra, se reporta al Gerente de Tienda el mismo día y se levanta acta administrativa. |
| Más de 1,000.00 pesos | Crítica | Se reporta de inmediato al Gerente de Tienda y a Prevención de Pérdidas; se revisa videograbación de la caja. |
"""),
  ("Incidencia", "### 9.3", """
| Incidencia | Acción de primer nivel en tienda | Prioridad del ticket si persiste |
|---|---|---|
| Terminal de punto de venta sin acceso al sistema | Reiniciar terminal; verificar cable de red. | Alta |
| Pérdida total del enlace de datos de la tienda | Activar modo sin conexión en cajas; avisar a Mesa de Servicio por teléfono. | Crítica |
| Báscula de perecederos no imprime etiquetas | Reiniciar báscula; verificar rollo de etiquetas. | Media |
| Handheld de SIGMA Móvil no sincroniza | Cerrar y abrir la aplicación; conectar a la red inalámbrica de tienda. | Baja |
| Terminal bancaria rechaza todas las tarjetas | Reiniciar terminal bancaria; probar con tarjeta de prueba de la tienda. | Alta |
| Servidor de tienda apagado o sin respuesta | No manipular; llamar de inmediato a Mesa de Servicio. | Crítica |
"""),
  ("Versi Fecha", None, """
| Versión | Fecha | Descripción del cambio | Autorizó |
|---|---|---|---|
| 1.0 | 1 de junio de 2021 | Emisión inicial del manual. | Dirección de Operaciones de Tienda |
| 2.0 | 1 de abril de 2023 | Se sustituye la bitácora en papel por la aplicación "Tienda al Día"; se agregan checklists con hora y responsable. | Dirección de Operaciones de Tienda |
| 2.1 | 1 de noviembre de 2023 | Se agrega la tabla de clasificación de diferencias en arqueo. | Dirección de Operaciones de Tienda |
| 2.2 | 1 de mayo de 2024 | Se actualiza el protocolo ante fallas de energía con los tiempos de respaldo de cámaras y muebles. | Dirección de Operaciones de Tienda |
| 2.5 | 1 de octubre de 2025 | Se incorpora la regla de horario reducido por obras que afecten más del 30 % del área de venta y la sección de incidencias de TI. | Dirección de Operaciones de Tienda |
"""),
 ],
 "politica_mermas_y_caducidad": [
  ("Categoría Lácteos", "### 4.1", """
| Categoría | Tolerancia mensual (% de venta) | Umbral de alerta (%) | Frecuencia de conteo |
|---|---|---|---|
| Lácteos | 1.8 | 2.8 | Semanal |
| Panadería | 3.5 | 4.5 | Diaria |
| Carnes | 2.5 | 3.5 | Diaria |
| Frutas y verduras | 4.5 | 5.5 | Diaria |
| Abarrotes | 0.6 | 1.6 | Mensual |
| Bebidas | 0.8 | 1.8 | Mensual |
| Limpieza | 0.4 | 1.4 | Trimestral |
| Cuidado personal | 0.5 | 1.5 | Trimestral |
"""),
  ("Área", "## 6. Rebajas", """
| Área | Frecuencia mínima de revisión | Responsable |
|---|---|---|
| Lácteos y refrigerados | Dos veces al día (apertura y turno vespertino) | Supervisor de Perecederos |
| Panadería y tortillería | Al inicio de cada turno | Encargado de Panadería |
| Carnes, pescados y mariscos | Al inicio de cada turno | Encargado de Carnes |
| Frutas y verduras | Revisión visual continua; retiro al detectar deterioro | Encargado de Frutas y Verduras |
| Abarrotes y bebidas | Semanal por pasillo, conforme a calendario de la tienda | Jefe de Abarrotes |
| Limpieza y cuidado personal | Mensual | Jefe de No Comestibles |
"""),
  ("Días restantes antes", "### 6.1", """
| Días restantes antes de la fecha de caducidad | Descuento sobre precio regular |
|---|---|
| 5 días | 15 % |
| 4 días | 25 % |
| 3 días | 35 % |
| 2 días | 50 % |
| 1 día (solo perecederos no lácteos) | 60 % |
"""),
  ("Rol Gerente de Tienda", "## 10. Conteos", """
| Rol | Responsabilidades principales |
|---|---|
| Gerente de Tienda | Autorizar diariamente el lote de mermas en SIGMA; dar seguimiento al indicador de merma por categoría; presentar planes de acción cuando se supere el umbral de alerta; garantizar la ejecución de los conteos programados. |
| Subgerente de Tienda | Suplir al Gerente en la autorización de mermas; supervisar la aplicación de las rebajas escalonadas; verificar la correcta disposición del producto mermado. |
| Supervisor de Perecederos | Coordinar la revisión de fechas en refrigerados y lácteos; asegurar el cumplimiento de las reglas de retiro de anaquel; registrar mermas en SIGMA Móvil. |
| Encargados de departamento | Ejecutar la rotación PEPS; identificar y marcar producto PVC; registrar mermas de su departamento; participar en los conteos. |
| Jefe de Recepción | Verificar fechas de caducidad y estado del empaque al recibir mercancía; rechazar producto con vida de anaquel insuficiente conforme al PRO-LOG-003. |
| Auditoría Interna | Realizar visitas de verificación; validar la consistencia entre registros de SIGMA y evidencia física; emitir hallazgos y dar seguimiento a su cierre. |
| Gerencia Regional de Operaciones | Consolidar el indicador regional; aprobar planes de acción; autorizar ajustes por conteo de alto valor. |
"""),
  ("Versi Fecha", None, """
| Versión | Fecha | Descripción del cambio | Autorizó |
|---|---|---|---|
| 1.0 | 15 de enero de 2022 | Emisión inicial de la política. | Dirección de Operaciones de Tienda |
| 2.0 | 1 de febrero de 2023 | Se incorpora el sistema SIGMA como sistema único de registro; se elimina el formato en papel. | Dirección de Operaciones de Tienda |
| 3.0 | 1 de marzo de 2024 | Se actualiza la tabla de tolerancias por categoría y se agrega la regla de retiro de lácteos dos días antes de la caducidad. | Dirección de Operaciones de Tienda |
| 3.1 | 1 de septiembre de 2024 | Se ajusta la escala de rebajas para producto próximo a vencer y se agrega la sección de categorías excluidas. | Dirección de Operaciones de Tienda |
| 3.2 | 1 de marzo de 2025 | Revisión anual sin cambio en tolerancias; se precisan responsabilidades de Auditoría Interna y se agregan indicadores de seguimiento. | Dirección de Operaciones de Tienda |
"""),
 ],
 "procedimiento_devoluciones": [
  ("Tipo de producto", "### 3.1", """
| Tipo de producto | Plazo para devolución o cambio | Requisitos |
|---|---|---|
| Abarrotes y no perecederos | 30 días | Ticket de compra; producto cerrado y en buen estado. |
| Perecederos | 48 horas | Ticket de compra; el producto debe presentar defecto de calidad (descomposición, mal olor, cuerpo extraño, caducidad vencida al momento de la compra). |
| Electrodomésticos y electrónicos menores | 30 días naturales | Ticket de compra, empaque original completo con accesorios y manuales. |
| Ropa y textiles | 30 días | Ticket de compra; prenda sin uso, con etiquetas originales. |
| Medicamentos | Sin devolución | No aplica, por disposición sanitaria. Únicamente procede cambio por defecto de fabricación visible o error de despacho documentado. |
| Artículos de temporada (navideños, escolares, etc.) | 15 días | Ticket de compra; producto cerrado. No procede después de concluida la temporada. |
| Vales, tarjetas de regalo y recargas | Sin devolución | No aplica una vez activados. |
"""),
  ("Forma de pago original", "### 6.1", """
| Forma de pago original | Forma de reembolso | Tiempo estimado de acreditación |
|---|---|---|
| Efectivo | Efectivo en caja de Servicio al Cliente | Inmediato |
| Tarjeta de débito | Reverso a la misma tarjeta | 3 a 5 días hábiles, según banco emisor |
| Tarjeta de crédito | Reverso a la misma tarjeta | 1 a 2 ciclos de facturación, según banco emisor |
| Vale de tienda o tarjeta de regalo | Nuevo vale de tienda | Inmediato |
| Monedero electrónico de lealtad | Abono al mismo monedero | Inmediato |
| Pago mixto (dos o más formas) | Se reembolsa primero a tarjeta hasta el monto pagado con ella; el resto en la forma correspondiente | Según cada forma |
| Pago en línea (pedido de ecommerce) | Reverso al medio de pago del pedido, gestionado por el área de Ecommerce | 5 a 10 días hábiles |
"""),
  ("Rango de monto", "### 9.1", """
| Rango de monto (pesos) | Quién autoriza | Observaciones |
|---|---|---|
| Hasta 500.00 | Ejecutivo de Servicio al Cliente | Autorización directa en terminal. |
| De 500.01 a 3,000.00 | Supervisor de Servicio al Cliente | Firma electrónica en terminal. |
| De 3,000.01 a 10,000.00 | Gerente de Servicio al Cliente o Subgerente de Tienda | Firma electrónica y captura de motivo. |
| De 10,000.01 a 30,000.00 | Gerente de Tienda | Firma electrónica, captura de motivo y copia de identificación del cliente. |
| Más de 30,000.00 | Gerente de Tienda con visto bueno del Gerente Regional de Servicio al Cliente | Se documenta por correo electrónico antes de ejecutar la operación. |
"""),
  ("Versi Fecha", None, """
| Versión | Fecha | Descripción del cambio | Autorizó |
|---|---|---|---|
| 1.0 | 10 de marzo de 2021 | Emisión inicial del procedimiento. | Dirección de Servicio al Cliente |
| 2.0 | 1 de julio de 2022 | Se agrega la sección de devoluciones sin ticket y los límites por cliente. | Dirección de Servicio al Cliente |
| 3.0 | 1 de agosto de 2023 | Se incorpora la tabla de reembolsos por forma de pago y las reglas para pedidos de comercio electrónico. | Dirección de Servicio al Cliente |
| 3.1 | 15 de enero de 2024 | Se actualizan los rangos de autorización por monto. | Dirección de Servicio al Cliente |
| 4.0 | 15 de junio de 2025 | Se homologan los plazos por tipo de producto en una sola tabla; se amplía la sección de prevención de fraude. | Dirección de Servicio al Cliente |
"""),
 ],
}

def aplicar(nombre, lineas):
    """Sustituye cada region revuelta por su tabla. Falla en voz alta si un ancla no aparece."""
    for inicio, fin, tabla in TABLAS.get(nombre, []):
        i = next(k for k, l in enumerate(lineas) if l.startswith(inicio))
        j = next((k for k, l in enumerate(lineas) if k > i and l.startswith(fin)), len(lineas)) if fin else len(lineas)
        lineas[i:j] = tabla.strip("\n").split("\n") + [""]
    return lineas
