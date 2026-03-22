/* =========================================
   SISTEMA CENTRAL NUTRAFIT
   ========================================= */
const URL_GOOGLE_SCRIPT = "https://script.google.com/macros/s/AKfycbyKeToe21yshYN6KNyFeZLSuKaaVlpDfbOCcu_msX4QP_fUvby7lbY_pPSYHEirABgv/exec";

// Variables globales de estado
let vasosActuales = 0;
const objetivoDiario = 8;

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

        if (nombreVista === 'agua') {
            inicializarAgua();
            cargarHistorico();
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

/* --- 3. CONEXIÓN CON GOOGLE SHEETS (HISTORIAL) --- */
async function reiniciarAgua() {
    if (vasosActuales === 0) {
        alert("¡Marca al menos un vaso!");
        return;
    }

    if (confirm("¿Guardar y reiniciar?")) {
        try {
            // Enviamos como texto plano para evitar bloqueos de CORS en el envío
            await fetch(URL_GOOGLE_SCRIPT, {
                method: "POST",
                mode: "no-cors", 
                body: JSON.stringify({ vasos: vasosActuales })
            });

            // Si llegamos aquí, asumimos éxito (no-cors no permite leer la respuesta, pero el dato llega)
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
        // Añadimos el timestamp para evitar que el navegador guarde datos viejos
        const respuesta = await fetch(URL_GOOGLE_SCRIPT + "?t=" + new Date().getTime());
        const filas = await respuesta.json();

        contenedor.innerHTML = ""; 

        if (!filas || filas.length === 0) {
            contenedor.innerHTML = "<tr><td colspan='3' style='padding:20px;'>Aún no hay registros en el historial</td></tr>";
            return;
        }

        filas.forEach(fila => {
            let tr = document.createElement('tr');
            
            // 1. Formateo de fecha (de ISO a DD/MM/AAAA)
            let fechaFormateada = fila[0];
            try {
                let fechaObj = new Date(fila[0]);
                fechaFormateada = fechaObj.toLocaleDateString('es-ES', {
                    day: '2-digit', 
                    month: '2-digit', 
                    year: 'numeric'
                });
            } catch (e) {
                console.error("Error al formatear fecha:", e);
            }

            // 2. Color del estado (Verde si está completado, Naranja si está pendiente)
            const colorEstado = fila[2] === "COMPLETADO" ? "#2ecc71" : "#e67e22";
            
            // 3. Insertamos las celdas limpias para que el CSS de .tabla-nutrafit las decore
            tr.innerHTML = `
                <td>${fechaFormateada}</td>
                <td>${fila[1]}</td>
                <td style="color:${colorEstado}; font-weight:bold;">
                    ${fila[2]}
                </td>
            `;
            contenedor.appendChild(tr);
        });

    } catch (error) {
        console.error("Fallo al cargar historial:", error);
        contenedor.innerHTML = "<tr><td colspan='3' style='padding:20px; color:red;'>Error de conexión al cargar datos</td></tr>";
    }
}