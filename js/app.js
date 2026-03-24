/* =========================================
   SISTEMA CENTRAL NUTRAFIT
   ========================================= */
const URL_GOOGLE_SCRIPT = "https://script.google.com/macros/s/AKfycbzFF2CRYNxpXB7dItBz8423VCDnzNf09OvRN4JcgCNK0iwbTl3RFAqRtYmvyHipccBy/exec";

// Variables globales de estado
let vasosActuales = 0;
const objetivoDiario = 8;
let graficoPesoInstancia = null;

/* --- 1. NAVEGACIÓN TIPO APP (SIN RECARGAR PÁGINA) --- */
async function abrirVista(nombreVista) {
    const pantallaInicio = document.getElementById('pantalla-inicio');
    const contenedorVistas = document.getElementById('contenedor-vistas');

    try {
        const respuesta = await fetch(`vistas/${nombreVista}.html`);
        const textoHtml = await respuesta.text();
        
        contenedorVistas.innerHTML = textoHtml;
        
        pantallaInicio.style.display = 'none';
        contenedorVistas.style.display = 'block';

        // Lógica específica según la vista
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

    } catch (error) {
        console.error("Error al abrir la vista:", error);
        alert("No se pudo cargar la sección.");
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
        if (vasosActuales < objetivoDiario) {
            vasosActuales++;
        }
    }
    localStorage.setItem('agua_nutrafit', vasosActuales);
    actualizarInterfazAgua();
}

function actualizarInterfazAgua() {
    const texto = document.getElementById('contador-texto');
    const barra = document.getElementById('barra-llenado');
    const botones = document.querySelectorAll('.boton-vaso');

    if (texto) texto.innerText = `${vasosActuales} / ${objetivoDiario} Vasos`;
    
    if (barra) {
        const porcentaje = (vasosActuales / objetivoDiario) * 100;
        barra.style.width = `${porcentaje}%`;
    }

    botones.forEach((btn, index) => {
        if (index < vasosActuales) {
            btn.classList.add('activo');
        } else {
            btn.classList.remove('activo');
        }
    });
}

async function reiniciarAgua() {
    if (vasosActuales === 0) {
        alert("¡Marca al menos un vaso!");
        return;
    }

    if (confirm("¿Guardar y reiniciar?")) {
        try {
            await fetch(URL_GOOGLE_SCRIPT, {
                method: "POST",
                mode: "no-cors", 
                body: JSON.stringify({ tipo: "agua", vasos: vasosActuales })
            });

            alert("¡Datos enviados con éxito!");
            vasosActuales = 0;
            localStorage.setItem('agua_nutrafit', 0);
            actualizarInterfazAgua();
            setTimeout(cargarHistorico, 2000); 

        } catch (error) {
            alert("Error al conectar.");
        }
    }
}

async function cargarHistorico() {
    const contenedor = document.getElementById('datos-tabla');
    if (!contenedor) return;

    try {
        const respuesta = await fetch(URL_GOOGLE_SCRIPT + "?t=" + new Date().getTime());
        const filas = await respuesta.json();
        contenedor.innerHTML = ""; 

        if (!filas || filas.length === 0) {
            contenedor.innerHTML = "<tr><td colspan='3' style='padding:20px;'>Aún no hay registros</td></tr>";
            return;
        }

        filas.forEach(fila => {
            let tr = document.createElement('tr');
            let f = new Date(fila[0]);
            let fechaF = !isNaN(f) ? f.toLocaleDateString('es-ES') : "---";
            const colorEstado = fila[2] === "COMPLETADO" ? "#2ecc71" : "#e67e22";
            
            tr.innerHTML = `<td>${fechaF}</td><td>${fila[1]}</td><td style="color:${colorEstado}; font-weight:bold;">${fila[2]}</td>`;
            contenedor.appendChild(tr);
        });
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

async function cargarHistorialCreditos() {
    const cuerpoTabla = document.getElementById('tabla-creditos-body');
    if (!cuerpoTabla) return;
    try {
        const response = await fetch(URL_GOOGLE_SCRIPT + "?tabla=creditos&t=" + new Date().getTime());
        const datos = await response.json();
        cuerpoTabla.innerHTML = datos.map(fila => `<tr><td>${new Date(fila[0]).toLocaleDateString('es-ES')}</td><td>${fila[5]}</td><td>${fila[1]}</td></tr>`).join('');
    } catch (e) { console.log("Error créditos", e); }
}

/* --- 4. LÓGICA DE EVOLUCIÓN DE PESO E IMC --- */

function inicializarPeso() {
    const inputFecha = document.getElementById('fecha-peso');
    if(inputFecha) inputFecha.value = new Date().toISOString().split('T')[0];
    cargarHistorialPeso();
}

// FUNCIÓN PARA QUE FUNCIONEN LOS BOTONES + Y - EN LA VISTA DE PESO
function ajustarPeso(valor) {
    const input = document.getElementById('input-peso');
    if (!input) return;
    let actual = parseFloat(input.value) || 70; 
    let nuevoPeso = (actual + valor).toFixed(1);
    input.value = nuevoPeso;
    
    // Actualizamos el IMC en tiempo real al tocar botones
    calcularIMC(nuevoPeso);
}

// NUEVA FUNCIÓN: CALCULAR IMC
function calcularIMC(peso) {
    // Intentamos obtener la altura de la calculadora de créditos (si existe)
    const inputAltura = document.getElementById('altura-credito');
    let altura = inputAltura ? parseFloat(inputAltura.value) / 100 : 1.70; // 1.70m por defecto

    if (altura > 0) {
        const imc = (peso / (altura * altura)).toFixed(1);
        actualizarInterfazIMC(imc);
    }
}

// NUEVA FUNCIÓN: ACTUALIZAR INTERFAZ IMC
function actualizarInterfazIMC(imc) {
    const contenedor = document.getElementById('contenedor-imc');
    const valorElem = document.getElementById('valor-imc');
    const estadoElem = document.getElementById('estado-imc');
    
    if (!contenedor || !valorElem || !estadoElem) return;

    contenedor.style.display = "block";
    valorElem.innerText = imc;

    let color = "#ccc";
    let texto = "";

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
    const datos = { tipo: "peso", fecha: fecha, peso: pesoActual, diferencia: diferencia };

    try {
        await fetch(URL_GOOGLE_SCRIPT, { method: 'POST', mode: 'no-cors', body: JSON.stringify(datos) });
        
        const msgDiv = document.getElementById('mensaje-motivador');
        if (msgDiv) {
            msgDiv.style.display = "block";
            if (diferencia < 0) {
                msgDiv.innerHTML = "¡¡Genial, lo estás consiguiendo, todo esfuerzo tiene su recompensa!!";
                msgDiv.style.color = "#155724";
            } else if (diferencia > 0) {
                msgDiv.innerHTML = "¡Vamos, tú puedes. El próximo día mejor, ya verás. Ánimo!";
                msgDiv.style.color = "#856404";
            } else {
                msgDiv.innerHTML = "¡Te mantienes estable! Sigue así.";
                msgDiv.style.color = "#004085";
            }
        }

        alert("Peso guardado correctamente");
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
            const colorDif = dif < 0 ? "color: #2ecc71;" : (dif > 0 ? "color: #e74c3c;" : "");
            const icono = dif < 0 ? "↓" : (dif > 0 ? "↑" : "");
            
            return `<tr>
                <td>${new Date(fila[0]).toLocaleDateString('es-ES')}</td>
                <td style="font-weight:bold;">${fila[1]} kg</td>
                <td style="${colorDif} font-weight:bold;">${icono} ${Math.abs(dif).toFixed(1)}</td>
            </tr>`;
        }).join('');

        // Al cargar el historial, calculamos el IMC con el peso más reciente
        calcularIMC(datos[0][1]);
        renderizarGrafico([...datos].reverse());
    } catch (e) { console.error("Error cargando peso", e); }
}

function renderizarGrafico(datos) {
    const ctx = document.getElementById('graficoPeso');
    if (!ctx) return;
    if (graficoPesoInstancia) graficoPesoInstancia.destroy();

    graficoPesoInstancia = new Chart(ctx, {
        type: 'line',
        data: {
            labels: datos.map(f => new Date(f[0]).toLocaleDateString('es-ES', {day:'2-digit', month:'2-digit'})),
            datasets: [{
                label: 'Evolución de Peso',
                data: datos.map(f => f[1]),
                borderColor: '#78a978',
                backgroundColor: 'rgba(120, 169, 120, 0.2)',
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                pointRadius: 4
            }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: false } }
        }
    });
}