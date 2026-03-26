/* =========================================
   SISTEMA CENTRAL NUTRAFIT
   ========================================= */
const URL_GOOGLE_SCRIPT = "https://script.google.com/macros/s/AKfycbwNEuYst_1B26vDliXCAEZGYFP9XzSMkqjVInVIPO-oyPmnVU0gNn7nhEcUkxqaDDIv/exec";

// Variables globales de estado
let vasosActuales = 0;
const objetivoDiario = 8;
let graficoPesoInstancia = null;

/* --- 1. NAVEGACIÓN TIPO APP --- */
async function abrirVista(nombreVista) {
    const pantallaInicio = document.getElementById('pantalla-inicio');
    const contenedorVistas = document.getElementById('contenedor-vistas');

    try {
        const respuesta = await fetch(`vistas/${nombreVista}.html`);
        const textoHtml = await respuesta.text();
        
        contenedorVistas.innerHTML = textoHtml;
        pantallaInicio.style.display = 'none';
        contenedorVistas.style.display = 'block';

        if (nombreVista === 'agua') {
            inicializarAgua();
            cargarHistorico();
        }

        if (nombreVista === 'creditos-diarios') {
            setTimeout(() => {
                inicializarFecha(); 
                calcularCreditos(); 
                cargarHistorialCreditos(); 
            }, 100);
        }

        if (nombreVista === 'evolucion-peso') {
            setTimeout(inicializarPeso, 100);
        }
        if (nombreVista === 'nuestra_despensa') {
    setTimeout(cargarDespensa, 100); // Esto dispara la carga de datos al abrir la vista
}

    } catch (error) {
        console.error("Error al abrir la vista:", error);
    }
}

function volverInicio() {
    document.getElementById('pantalla-inicio').style.display = 'flex';
    document.getElementById('contenedor-vistas').style.display = 'none';
}

/* --- 2. LÓGICA DE CONTROL DE AGUA --- */
function inicializarAgua() {
    const guardado = localStorage.getItem('agua_nutrafit');
    vasosActuales = guardado ? parseInt(guardado) : 0;
    actualizarInterfazAgua();
}

function gestionarVaso(indiceVaso) {
    if (indiceVaso < vasosActuales) {
        vasosActuales = indiceVaso; 
    } else {
        if (vasosActuales < objetivoDiario) vasosActuales++;
    }
    localStorage.setItem('agua_nutrafit', vasosActuales);
    actualizarInterfazAgua();
}

function actualizarInterfazAgua() {
    const texto = document.getElementById('contador-texto');
    const barra = document.getElementById('barra-llenado');
    const botones = document.querySelectorAll('.boton-vaso');

    if (texto) texto.innerText = `${vasosActuales} / ${objetivoDiario} Vasos`;
    if (barra) barra.style.width = `${(vasosActuales / objetivoDiario) * 100}%`;

    botones.forEach((btn, index) => {
        index < vasosActuales ? btn.classList.add('activo') : btn.classList.remove('activo');
    });
}

async function reiniciarAgua() {
    if (vasosActuales === 0) return alert("¡Marca al menos un vaso!");
    if (confirm("¿Guardar y reiniciar?")) {
        try {
            await fetch(URL_GOOGLE_SCRIPT, {
                method: "POST",
                mode: "no-cors", 
                body: JSON.stringify({ tipo: "agua", vasos: vasosActuales })
            });
            alert("¡Datos enviados!");
            vasosActuales = 0;
            localStorage.setItem('agua_nutrafit', 0);
            actualizarInterfazAgua();
            setTimeout(cargarHistorico, 2000); 
        } catch (error) { alert("Error al conectar."); }
    }
}

async function cargarHistorico() {
    const contenedor = document.getElementById('datos-tabla');
    if (!contenedor) return;
    try {
        const respuesta = await fetch(URL_GOOGLE_SCRIPT + "?t=" + new Date().getTime());
        const filas = await respuesta.json();
        contenedor.innerHTML = filas.map(fila => {
            const colorEstado = fila[2] === "COMPLETADO" ? "#2ecc71" : "#e67e22";
            return `<tr><td>${new Date(fila[0]).toLocaleDateString('es-ES')}</td><td>${fila[1]}</td><td style="color:${colorEstado}; font-weight:bold;">${fila[2]}</td></tr>`;
        }).join('') || "<tr><td colspan='3'>Sin registros</td></tr>";
    } catch (error) { console.error("Error historial agua", error); }
}

/* --- 3. LÓGICA DE CRÉDITOS --- */
function ajustarValor(id, incremento) {
    const input = document.getElementById(id);
    if (!input) return;
    let valorActual = parseFloat(input.value) || 0;
    input.value = (valorActual + incremento).toFixed(id === 'peso-credito' ? 1 : 0);
    calcularCreditos();
}

function calcularCreditos() {
    const genElem = document.getElementById('genero-credito');
    const pesoElem = document.getElementById('peso-credito');
    const altElem = document.getElementById('altura-credito');
    const edadElem = document.getElementById('edad-credito');
    const resElem = document.getElementById('resultado-creditos');

    if (!genElem || !pesoElem || !altElem || !edadElem || !resElem) return;

    const genero = genElem.value;
    const peso = parseFloat(pesoElem.value) || 0;
    const altura = parseFloat(altElem.value) || 0;
    const edad = parseInt(edadElem.value) || 0;

    if (peso > 0 && altura > 0 && edad > 0) {
        let tmb = (genero === "Hombre") 
            ? (10 * peso) + (6.25 * altura) - (5 * edad) + 5
            : (10 * peso) + (6.25 * altura) - (5 * edad) - 161;
        resElem.value = Math.ceil((tmb * 0.9) / 35);
    }
}

function inicializarFecha() {
    const f = document.getElementById('fecha-credito');
    if(f) f.value = new Date().toISOString().split('T')[0];
}

async function guardarCreditos() {
    const total = document.getElementById('resultado-creditos').value;
    if (!total || total == 0) return alert("Primero calcula tus créditos");

    const datos = {
        tipo: "creditos",
        fecha: document.getElementById('fecha-credito').value,
        genero: document.getElementById('genero-credito').value,
        edad: document.getElementById('edad-credito').value,
        peso: document.getElementById('peso-credito').value,
        altura: document.getElementById('altura-credito').value,
        total: total
    };

    try {
        await fetch(URL_GOOGLE_SCRIPT, { method: 'POST', mode: 'no-cors', body: JSON.stringify(datos) });
        alert("¡Créditos guardados!");
        setTimeout(cargarHistorialCreditos, 2000);
    } catch (e) { alert("Error al guardar"); }
}

async function cargarHistorialCreditos() {
    const cuerpoTabla = document.getElementById('tabla-creditos-body');
    if (!cuerpoTabla) return;
    try {
        const response = await fetch(URL_GOOGLE_SCRIPT + "?tabla=creditos&t=" + new Date().getTime());
        const datos = await response.json();
        cuerpoTabla.innerHTML = datos.map(fila => `
            <tr>
                <td>${new Date(fila[0]).toLocaleDateString('es-ES')}</td>
                <td style="font-weight:bold; color:#78a978;">${fila[5] || '---'}</td>
                <td>${fila[1] || '---'}</td>
            </tr>
        `).join('');
    } catch (e) { console.log("Error créditos", e); }
}

/* --- 4. LÓGICA DE EVOLUCIÓN DE PESO --- */
function inicializarPeso() {
    const inputFecha = document.getElementById('fecha-peso');
    if(inputFecha) inputFecha.value = new Date().toISOString().split('T')[0];
    cargarHistorialPeso();
}

function ajustarPeso(valor) {
    const input = document.getElementById('input-peso');
    if (!input) return;
    let actual = parseFloat(input.value) || 70; 
    let nuevoPeso = (actual + valor).toFixed(1);
    input.value = nuevoPeso;
    calcularIMC(nuevoPeso);
}

function calcularIMC(peso) {
    const inputAltura = document.getElementById('altura-credito');
    let altura = (inputAltura && parseFloat(inputAltura.value) > 0) ? parseFloat(inputAltura.value) / 100 : 1.70; 
    
    if (altura > 0) {
        const imc = (peso / (altura * altura)).toFixed(1);
        actualizarInterfazIMC(imc);
    }
}

function actualizarInterfazIMC(imc) {
    const contenedor = document.getElementById('contenedor-imc');
    const valorElem = document.getElementById('valor-imc');
    const estadoElem = document.getElementById('estado-imc');
    
    if (!valorElem || !estadoElem) return;
    if (contenedor) contenedor.style.display = "block";

    valorElem.innerText = imc;
    let color = "#ccc", texto = "";

    if (imc < 18.5) { texto = "Bajo Peso"; color = "#3498db"; }
    else if (imc < 25) { texto = "Normal"; color = "#2ecc71"; }
    else if (imc < 30) { texto = "Sobrepeso"; color = "#f1c40f"; }
    else { texto = "Obesidad"; color = "#e74c3c"; }

    estadoElem.innerText = texto.toUpperCase();
    estadoElem.style.background = color;
}

async function guardarPeso() {
    const inputPeso = document.getElementById('input-peso');
    const inputFecha = document.getElementById('fecha-peso');
    if(!inputPeso || !inputPeso.value) return alert("Introduce el peso");

    const pesoActual = parseFloat(inputPeso.value);
    const fecha = inputFecha.value;
    const tabla = document.getElementById('tabla-peso-body');
    let ultimoPeso = pesoActual;
    
    if (tabla && tabla.rows.length > 0 && !tabla.rows[0].innerText.includes("registros")) {
        ultimoPeso = parseFloat(tabla.rows[0].cells[1].innerText);
    }

    const diferencia = (pesoActual - ultimoPeso).toFixed(1);

    if (diferencia < 0) {
        alert(`¡ESPECTACULAR! Has bajado ${Math.abs(diferencia)} kg. ¡Te mereces un premio sano! 🥳`);
    } else if (diferencia > 0) {
        alert(`¡No te rindas! Has subido ${diferencia} kg, pero mañana es un nuevo día para mejorar. 💪`);
    } else {
        alert("Te mantienes estable. ¡Sigue así!");
    }

    const datos = { tipo: "peso", fecha: fecha, peso: pesoActual, diferencia: diferencia };

    try {
        await fetch(URL_GOOGLE_SCRIPT, { method: 'POST', mode: 'no-cors', body: JSON.stringify(datos) });
        setTimeout(cargarHistorialPeso, 2000);
    } catch (e) { alert("Error al guardar"); }
}

async function cargarHistorialPeso() {
    const cuerpo = document.getElementById('tabla-peso-body');
    if(!cuerpo) return;

    try {
        const res = await fetch(URL_GOOGLE_SCRIPT + "?tabla=peso&t=" + new Date().getTime());
        const datos = await res.json();

        if (!datos || datos.length === 0) {
            cuerpo.innerHTML = "<tr><td colspan='3'>Aún no hay registros</td></tr>";
            return;
        }

        cuerpo.innerHTML = datos.map(fila => {
            const dif = parseFloat(fila[2]) || 0;
            const icono = dif < 0 ? "↓" : (dif > 0 ? "↑" : "");
            return `<tr>
                <td>${new Date(fila[0]).toLocaleDateString('es-ES')}</td>
                <td style="font-weight:bold;">${fila[1]} kg</td>
                <td style="font-weight:bold; color:${dif < 0 ? '#2ecc71' : '#e74c3c'}">${icono} ${Math.abs(dif).toFixed(1)}</td>
            </tr>`;
        }).join('');

        calcularIMC(parseFloat(datos[0][1]));
        renderizarGrafico([...datos].reverse());

    } catch (e) { console.error("Error peso", e); }
}

function renderizarGrafico(datos) {
    const ctx = document.getElementById('graficoPeso');
    if (!ctx || typeof Chart === 'undefined') return;
    if (graficoPesoInstancia) graficoPesoInstancia.destroy();
    graficoPesoInstancia = new Chart(ctx, {
        type: 'line',
        data: {
            labels: datos.map(f => new Date(f[0]).toLocaleDateString('es-ES', {day:'2-digit', month:'2-digit'})),
            datasets: [{
                label: 'Peso',
                data: datos.map(f => f[1]),
                borderColor: '#78a978',
                tension: 0.4,
                fill: true,
                backgroundColor: 'rgba(120, 169, 120, 0.1)'
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

/* --- 5. GENERACIÓN DE INFORME PDF CON GRÁFICO --- */
async function generarPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const fechaReporte = new Date().toLocaleDateString('es-ES');
    
    // 1. Cabecera Estilo Nutrafit
    doc.setFillColor(120, 169, 120);
    doc.rect(0, 0, 210, 40, 'F');
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(255, 255, 255);
    doc.text("INFORME DE EVOLUCIÓN NUTRAFIT", 20, 25);
    
    doc.setFontSize(10);
    doc.text(`Fecha del informe: ${fechaReporte}`, 20, 33);

    // 2. Gráfico (Captura del Canvas)
    const canvas = document.getElementById('graficoPeso');
    if (canvas) {
        const imgData = canvas.toDataURL("image/png");
        doc.setTextColor(100);
        doc.setFontSize(14);
        doc.text("Progreso Visual del Peso:", 20, 50);
        // Añadimos el gráfico (x, y, ancho, alto)
        doc.addImage(imgData, 'PNG', 15, 55, 180, 80);
    }

    // 3. Tabla de Datos
    let yTabla = 150;
    doc.setFontSize(14);
    doc.setTextColor(120, 169, 120);
    doc.text("Historial Detallado:", 20, yTabla);
    
    doc.setFontSize(10);
    doc.setTextColor(50);
    doc.setFont("helvetica", "bold");
    yTabla += 10;
    doc.text("Fecha", 25, yTabla);
    doc.text("Peso (kg)", 80, yTabla);
    doc.text("Diferencia", 130, yTabla);
    
    doc.line(20, yTabla + 2, 190, yTabla + 2);
    yTabla += 8;
    
    doc.setFont("helvetica", "normal");
    const tablaPeso = document.getElementById('tabla-peso-body');
    if (tablaPeso && !tablaPeso.innerText.includes("registros")) {
        const filas = Array.from(tablaPeso.rows).slice(0, 8); // Top 8 registros
        filas.forEach(fila => {
            doc.text(fila.cells[0].innerText, 25, yTabla);
            doc.text(fila.cells[1].innerText, 80, yTabla);
            doc.text(fila.cells[2].innerText, 130, yTabla);
            yTabla += 7;
        });
    }

    // 4. IMC y Estado Final
    const imcValue = document.getElementById('valor-imc')?.innerText || "--";
    const imcEstado = document.getElementById('estado-imc')?.innerText || "--";
    
    yTabla += 10;
    doc.setFillColor(240, 240, 240);
    doc.rect(20, yTabla, 170, 15, 'F');
    doc.setFont("helvetica", "bold");
    doc.text(`IMC Actual: ${imcValue} - Estado: ${imcEstado}`, 25, yTabla + 10);

    // Pie de página
    doc.setFontSize(9);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(150);
    doc.text("Nutrafit App - Tu asistente personal de salud", 105, 285, null, null, "center");

    doc.save(`Nutrafit_Evolucion_${fechaReporte}.pdf`);
}
/* --- 6. LÓGICA DE ALIMENTOS Y DESPENSA --- */

// Función para los botones +/- (Paso de 0.1 para precisión)
function ajustarMacroAlimento(id, inc) {
    const el = document.getElementById(id);
    if (!el) return;
    let val = parseFloat(el.value) || 0;
    el.value = Math.max(0, val + inc).toFixed(2);
    recalcularAlimento(); // Calcula automáticamente al cambiar valores
}

// TU FÓRMULA: (Grasa * 0.15) + (Carb * 0.12) + (Prot * 0.05) - (Fibra * 0.01)
function recalcularAlimento() {
    const prot = parseFloat(document.getElementById('alim-prot').value) || 0;
    const carb = parseFloat(document.getElementById('alim-carb').value) || 0;
    const gras = parseFloat(document.getElementById('alim-gras').value) || 0;
    const fibra = parseFloat(document.getElementById('alim-fibra').value) || 0;
    
    const calc = (gras * 0.15) + (carb * 0.12) + (prot * 0.05) - (fibra * 0.01);
    
    // Mostramos el resultado en el campo de solo lectura
    const campoCalc = document.getElementById('alim-calc');
    if (campoCalc) campoCalc.value = Math.max(0, calc).toFixed(2);
}

async function guardarEnDespensa() {
    const nombre = document.getElementById('alim-nombre').value;
    if(!nombre) return alert("Por favor, escribe el nombre del alimento");

    const manual = parseFloat(document.getElementById('alim-manual').value) || 0;
    const calculado = parseFloat(document.getElementById('alim-calc').value) || 0;

    // CRÉDITO NETO: Si hay manual, usamos ese. Si no, el calculado.
    const neto = manual > 0 ? manual : calculado;

    const datos = {
        tipo: "guardar_alimento",
        nombre: nombre,
        grupo: document.getElementById('alim-grupo').value,
        proteinas: document.getElementById('alim-prot').value,
        carbohidratos: document.getElementById('alim-carb').value,
        grasas: document.getElementById('alim-gras').value,
        fibra: document.getElementById('alim-fibra').value,
        manual: manual,
        calculado: calculado,
        neto: neto.toFixed(2)
    };

    try {
        // "no-cors" es necesario para Google Apps Script
        await fetch(URL_GOOGLE_SCRIPT, { method: 'POST', mode: 'no-cors', body: JSON.stringify(datos) });
        alert("✅ " + nombre + " guardado en la despensa");
        limpiarFormAlimento();
    } catch (e) { 
        alert("Error al conectar con la base de datos"); 
    }
}

function limpiarFormAlimento() {
    // Resetea todos los campos para el siguiente alimento
    const campos = ['alim-nombre', 'alim-prot', 'alim-carb', 'alim-gras', 'alim-fibra', 'alim-manual', 'alim-calc'];
    campos.forEach(id => {
        const el = document.getElementById(id);
        if(el) {
            if(el.type === 'number' || id === 'alim-calc') el.value = "0.00";
            else el.value = "";
        }
    });
}

/* --- 7. CARGA Y BUSCADOR DE DESPENSA --- */

async function cargarDespensa() {
    const contenedor = document.getElementById('lista-alimentos-agrupados');
    if(!contenedor) return;

    try {
        const res = await fetch(URL_GOOGLE_SCRIPT + "?tabla=alimentos&t=" + new Date().getTime());
        const datos = await res.json();
        
        if (!datos || datos.length === 0) {
            contenedor.innerHTML = "<p style='text-align:center; padding:20px;'>La despensa está vacía.</p>";
            return;
        }

        // Agrupar por el campo 'Grupo' (índice 1 de la fila)
        const grupos = {};
        datos.forEach(fila => {
            const nombreGrupo = fila[1];
            if(!grupos[nombreGrupo]) grupos[nombreGrupo] = [];
            grupos[nombreGrupo].push(fila);
        });

        // Ordenar grupos alfabéticamente
        const nombresGruposOrdenados = Object.keys(grupos).sort();

        let htmlFinal = "";
        nombresGruposOrdenados.forEach(nombreG => {
            htmlFinal += `
                <div class="grupo-despensa-seccion">
                    <div class="cabecera-grupo-despensa">${nombreG}</div>
                    <table class="tabla-despensa">
                        ${grupos[nombreG].map(a => `
                            <tr class="fila-alimento">
                                <td><b>${a[0]}</b></td>
                                <td style="text-align:right">
                                    <span class="credito-badge">${a[8]} créd.</span>
                                </td>
                            </tr>
                        `).join('')}
                    </table>
                </div>`;
        });
        contenedor.innerHTML = htmlFinal;

    } catch (e) { 
        contenedor.innerHTML = "<p style='color:red; text-align:center;'>Error al cargar los alimentos.</p>";
    }
}

function filtrarDespensa() {
    const textoBusqueda = document.getElementById('buscador-despensa').value.toLowerCase();
    const filas = document.querySelectorAll('.fila-alimento');
    
    filas.forEach(fila => {
        const nombreAlimento = fila.innerText.toLowerCase();
        fila.style.display = nombreAlimento.includes(textoBusqueda) ? "" : "none";
    });
}