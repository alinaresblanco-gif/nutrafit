/* ============================================================
    CONTROL TOTAL NUTRAFIT - MI LIBRO DE RECETAS (COMPLETO)
   ============================================================ */

let todasLasRecetas = []; 
let imagenRecetaBase64 = null;
let recetaActiva = null;

// --- 1. AL CARGAR LA PÁGINA ---
document.addEventListener('DOMContentLoaded', () => {
    // Solo intenta cargar si la URL está definida
    if (typeof URL_GOOGLE_SCRIPT !== 'undefined') {
        cargarRecetasDesdeSheets();
    }
});

// --- 2. NAVEGACIÓN ---
function mostrarFormulario() {
    document.getElementById('seccion-explorar').style.display = 'none';
    document.getElementById('seccion-formulario').style.display = 'block';
    window.scrollTo(0,0);
}

function volverExplorador() {
    document.getElementById('seccion-formulario').style.display = 'none';
    document.getElementById('modal-detalle-receta').style.display = 'none';
    document.getElementById('seccion-explorar').style.display = 'block';
}

function cerrarDetalle() {
    document.getElementById('modal-detalle-receta').style.display = 'none';
}

// --- 3. GESTIÓN DE IMAGEN ---
function previsualizarFotoReceta(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            imagenRecetaBase64 = e.target.result.split(',')[1];
            document.getElementById('img-previa-receta').src = e.target.result;
            document.getElementById('img-previa-receta').style.display = 'block';
            document.getElementById('icono-camara').style.display = 'none';
        }
        reader.readAsDataURL(input.files[0]);
    }
}

// --- 4. GUARDAR EN GOOGLE SHEETS ---
async function guardarNuevaReceta() {
    const nombre = document.getElementById('form-nombre').value;
    const categoria = document.getElementById('form-categoria').value;
    const ingredientes = document.getElementById('form-ingredientes').value;
    const elaboracion = document.getElementById('form-elaboracion').value;

    if (!nombre || !ingredientes) {
        return alert("Por favor, pon al menos el nombre y los ingredientes.");
    }

    const btn = document.querySelector('.btn-accion-form');
    const textoOriginal = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> GUARDANDO...';

    const datos = {
        tipo: "guardar_receta",
        nombre: nombre,
        categoria: categoria,
        ingredientes: ingredientes,
        elaboracion: elaboracion,
        imagen: imagenRecetaBase64
    };

    try {
        await fetch(URL_GOOGLE_SCRIPT, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify(datos)
        });

        alert("¡Receta guardada con éxito!");
        location.reload(); // Recarga para limpiar y mostrar la nueva
    } catch (error) {
        alert("Error al guardar. Revisa la conexión.");
        btn.disabled = false;
        btn.innerHTML = textoOriginal;
    }
}

// --- 5. CARGAR Y MOSTRAR RECETAS ---
async function cargarRecetasDesdeSheets() {
    const contenedor = document.getElementById('contenedor-cards');
    // No borramos la tarjeta demo inmediatamente, solo mostramos el log
    console.log("Cargando recetas desde Sheets...");

    try {
        const resp = await fetch(`${URL_GOOGLE_SCRIPT}?tabla=recetas&t=${Date.now()}`);
        todasLasRecetas = await resp.json();
        if (todasLasRecetas.length > 0) {
            renderizarRecetas(todasLasRecetas);
        }
    } catch (error) {
        console.error("Error al cargar o no hay recetas aún.");
    }
}

function renderizarRecetas(lista) {
    const contenedor = document.getElementById('contenedor-cards');
    contenedor.innerHTML = ""; // Aquí ya limpiamos la demo si hay datos reales

    lista.reverse().forEach((receta, index) => {
        const imgUrl = receta[1] || 'https://via.placeholder.com/150?text=NutraFit';
        const card = document.createElement('div');
        card.className = "tarjeta-receta";
        card.innerHTML = `
            <img src="${imgUrl}" alt="${receta[2]}">
            <div class="info-tarjeta">
                <h3>${receta[2]}</h3>
                <button class="btn-ver-receta" onclick="abrirDetalleReceta(${index})">VER RECETA</button>
            </div>
        `;
        contenedor.appendChild(card);
    });
}

// --- 6. BUSCADOR (Restaurado) ---
function filtrarRecetas() {
    const busqueda = document.getElementById('buscador-recetas').value.toLowerCase();
    const filtradas = todasLasRecetas.filter(r => 
        r[2].toLowerCase().includes(busqueda) || 
        r[4].toLowerCase().includes(busqueda)
    );
    renderizarRecetas(filtradas);
}

// --- 7. DETALLE DE RECETA (Restaurado) ---
function abrirDetalleReceta(index) {
    const listaInvertida = [...todasLasRecetas].reverse();
    const r = listaInvertida[index];
    recetaActiva = r;

    document.getElementById('det-img').src = r[1] || 'https://via.placeholder.com/400';
    document.getElementById('det-nombre').innerText = r[2];
    document.getElementById('det-cat').innerText = r[3];
    
    const listaIng = document.getElementById('det-ingredientes');
    listaIng.innerHTML = "";
    const ingredientesArr = r[4].split('\n');
    
    ingredientesArr.forEach(ing => {
        if(ing.trim() !== "") {
            const li = document.createElement('li');
            li.innerHTML = `
                <span>• ${ing}</span>
                <i class="fas fa-cart-plus btn-carrito" onclick="añadirAListaCompra('${ing.replace(/'/g, "\\'")}')"></i>
            `;
            listaIng.appendChild(li);
        }
    });

    document.getElementById('det-elaboracion').innerText = r[5];
    document.getElementById('modal-detalle-receta').style.display = 'block';
}

// --- 8. COMPARTIR (Restaurado) ---
function compartirReceta() {
    if (!recetaActiva) return;
    const texto = `📖 *${recetaActiva[2]}*\n🛒 *Ingredientes:*\n${recetaActiva[4]}\n\nCompartido desde NutraFit`;
    
    if (navigator.share) {
        navigator.share({ title: recetaActiva[2], text: texto }).catch(console.error);
    } else {
        window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank');
    }
}

// --- 9. AÑADIR AL CARRITO (Restaurado) ---
async function añadirAListaCompra(producto) {
    const datos = {
        tipo: "guardar_alimento", // Usamos el "case" que ya tienes en tu Apps Script
        nombre: producto,
        grupo: "Receta",
        manual: "1"
    };

    try {
        await fetch(URL_GOOGLE_SCRIPT, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify(datos)
        });
        alert("Añadido a la despensa: " + producto);
    } catch (e) {
        alert("No se pudo añadir.");
    }
}