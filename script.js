// ==================== DATOS DE LA APLICACIÓN ====================
const appData = {
    beneficios_deficit_calorico: [
        {
            titulo: "Acelera el Metabolismo",
            descripcion: "El matcha contiene catequinas (especialmente EGCG) que estimulan la termogénesis, aumentando el gasto calórico entre un 10-15% más en comparación con otras bebidas.",
            mecanismo: "Las catequinas activan procesos de quema de grasa y aceleran el metabolismo basal",
            icono: "🔥",
            evidencia: "Estudios demuestran aumento del gasto energético de hasta 4% en 24 horas"
        },
        {
            titulo: "Quema de Grasa Durante Ejercicio",
            descripcion: "Consumir matcha antes del ejercicio puede aumentar la oxidación de grasa hasta en un 25% durante entrenamientos de intensidad moderada.",
            mecanismo: "Las catequinas EGCG potencian la quema de grasa especialmente durante actividad física",
            icono: "💪",
            evidencia: "Estudios muestran mayor oxidación de grasa en caminatas de 30 minutos"
        },
        {
            titulo: "Efecto Saciante",
            descripcion: "Ayuda a reducir el apetito y los antojos, lo que facilita mantener el déficit calórico sin pasar hambre constante.",
            mecanismo: "Genera sensación de saciedad y ayuda a regular hormonas del hambre",
            icono: "🍃",
            evidencia: "Reduce antojos y ayuda a controlar porciones durante el día"
        },
        {
            titulo: "Regula Azúcar en Sangre",
            descripcion: "El matcha ayuda a estabilizar los niveles de glucosa, evitando picos de insulina que generan ansiedad y almacenamiento de grasa.",
            mecanismo: "Las catequinas inhiben la digestión de almidón y previenen liberación rápida de glucosa",
            icono: "📊",
            evidencia: "Niveles más estables de azúcar reducen antojos y hambre"
        },
        {
            titulo: "Elimina Retención de Líquidos",
            descripcion: "Tiene efecto diurético natural que ayuda a eliminar toxinas y líquidos retenidos, reduciendo hinchazón abdominal.",
            mecanismo: "Propiedades diuréticas naturales y alto contenido de clorofila desintoxicante",
            icono: "💧",
            evidencia: "Mejora la eliminación de toxinas y reduce hinchazón"
        },
        {
            titulo: "Energía Sostenida Sin Calorías",
            descripcion: "Proporciona energía constante durante el déficit calórico sin añadir calorías adicionales (casi 0 calorías por porción).",
            mecanismo: "Combinación de cafeína y L-teanina da energía prolongada sin crash",
            icono: "⚡",
            evidencia: "Energía estable de 4-6 horas sin bajones"
        }
    ],
    beneficios_tdah: [
        {
            titulo: "Mejora Atención Sostenida",
            descripcion: "La combinación de L-teanina y cafeína mejora significativamente la atención sostenida y el rendimiento en tareas que requieren concentración prolongada.",
            mecanismo: "L-teanina + cafeína trabajan sinérgicamente aumentando dopamina y reduciendo actividad de red neuronal por defecto",
            icono: "🎯",
            evidencia: "Estudios clínicos muestran mejora en tareas Go/NoGo y pruebas de atención"
        },
        {
            titulo: "Enfoque Calmado (Calm Focus)",
            descripcion: "Proporciona estado de alerta sin ansiedad ni nerviosismo, ideal para personas con TDAH que necesitan concentración sin sobreestimulación.",
            mecanismo: "L-teanina promueve ondas alfa cerebrales (estado de calma alerta) mientras cafeína mantiene activación",
            icono: "🧘",
            evidencia: "Reduce ansiedad mientras mejora claridad mental"
        },
        {
            titulo: "Mejora Control de Impulsos",
            descripcion: "La combinación L-teanina-cafeína mejora el control inhibitorio, reduciendo la impulsividad característica del TDAH.",
            mecanismo: "Disminuye tiempo de reacción en stop-signal tasks, mejorando función ejecutiva",
            icono: "🛡️",
            evidencia: "Mejora en pruebas de control inhibitorio en niños con TDAH"
        },
        {
            titulo: "Aumenta Dopamina",
            descripcion: "El matcha aumenta la actividad de dopamina y noradrenalina en el cerebro, neurotransmisores deficientes en personas con TDAH.",
            mecanismo: "Catequinas y cafeína estimulan liberación de dopamina, crucial para motivación y atención",
            icono: "🧠",
            evidencia: "Estudios muestran aumento de dopamina y noradrenalina"
        },
        {
            titulo: "Reduce Ansiedad Co-mórbida",
            descripcion: "La L-teanina reduce ansiedad que frecuentemente acompaña al TDAH, sin causar somnolencia.",
            mecanismo: "L-teanina modula GABA, serotonina y dopamina, reduciendo respuesta al estrés",
            icono: "😌",
            evidencia: "Reduce síntomas de ansiedad en situaciones estresantes"
        },
        {
            titulo: "Mejora Función Cognitiva Global",
            descripcion: "Mejora rendimiento en pruebas cognitivas generales, incluyendo memoria, velocidad de procesamiento y atención.",
            mecanismo: "Acción sinérgica de múltiples compuestos sobre diversas áreas cognitivas",
            icono: "📚",
            evidencia: "Mejoras significativas en NIH Cognition Toolbox"
        }
    ],
    beneficios_ayunas: [
        {
            titulo: "Máxima Absorción de Antioxidantes",
            descripcion: "En ayunas, el cuerpo absorbe más eficientemente los antioxidantes del matcha al no haber competencia con otros alimentos.",
            mecanismo: "Estómago vacío permite absorción rápida y completa de catequinas",
            icono: "✨",
            evidencia: "Mayor biodisponibilidad de nutrientes en ayunas"
        },
        {
            titulo: "Activa Metabolismo Matutino",
            descripcion: "Tomar matcha en ayunas activa el metabolismo desde el inicio del día, potenciando la quema de grasa durante todo el día.",
            mecanismo: "Efecto termogénico más pronunciado en ayunas",
            icono: "🌅",
            evidencia: "Potencia oxidación de grasa desde primeras horas"
        },
        {
            titulo: "Desintoxicación Natural",
            descripcion: "La clorofila del matcha actúa como desintoxicante natural, limpiando toxinas acumuladas, especialmente efectivo en ayunas.",
            mecanismo: "Alto contenido de clorofila favorece limpieza hepática y eliminación de toxinas",
            icono: "🌿",
            evidencia: "Promueve salud hepática y desintoxicación"
        },
        {
            titulo: "Energía Inmediata y Prolongada",
            descripcion: "La cafeína se absorbe más rápido en ayunas, proporcionando energía inmediata que dura 4-6 horas sin crash.",
            mecanismo: "Absorción rápida de cafeína combinada con liberación lenta gracias a L-teanina",
            icono: "⚡",
            evidencia: "Energía sostenida sin nerviosismo típico del café"
        }
    ],
    precauciones: [
        {
            titulo: "Posible Irritación Estomacal",
            descripcion: "En ayunas, los taninos del matcha pueden aumentar acidez estomacal en personas sensibles.",
            recomendacion: "Si tienes estómago sensible, come algo ligero 15-30 minutos antes",
            icono: "⚠️"
        },
        {
            titulo: "Sensibilidad a Cafeína",
            descripcion: "Aunque más suave que café, contiene cafeína que puede afectar a personas muy sensibles.",
            recomendacion: "Comienza con 1/2 cucharadita y aumenta gradualmente",
            icono: "☕"
        },
        {
            titulo: "Hora de Consumo",
            descripcion: "No consumir después de las 4 PM para evitar interferir con el sueño.",
            recomendacion: "Mejor horario: mañana o antes de ejercicio",
            icono: "🕐"
        },
        {
            titulo: "Calidad del Producto",
            descripcion: "Matcha de baja calidad puede contener aditivos o ser más amargo y causar más molestias.",
            recomendacion: "Elige matcha orgánico, ceremonial o premium, de origen japonés",
            icono: "✅"
        }
    ],
    pasos: [
        "Espera 15-20 minutos después de despertarte",
        "Bebe un vaso de agua primero para hidratarte",
        "Prepara tu matcha con agua a 70-80°C (no hirviendo)",
        "Bate vigorosamente hasta formar espuma",
        "Bebe lentamente, disfrutando el sabor",
        "Espera 15-30 minutos antes de desayunar (o toma con snack ligero si eres sensible)",
        "Ideal antes de ejercicio para maximizar quema de grasa"
    ]
};

// ==================== FUNCIONES PRINCIPALES ====================

// Función para renderizar beneficios
function renderBenefits(data, containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    data.forEach((benefit, index) => {
        const card = document.createElement('div');
        card.className = 'benefit-card';
        card.innerHTML = `
            <div class="benefit-icon">${benefit.icono}</div>
            <h3>${benefit.titulo}</h3>
            <p>${benefit.descripcion}</p>
            <button class="expand-btn" onclick="toggleDetails(this)">Ver más ↓</button>
            <div class="benefit-details">
                <div class="detail-item">
                    <strong>🔬 Mecanismo:</strong>
                    <p>${benefit.mecanismo}</p>
                </div>
                <div class="detail-item">
                    <strong>📊 Evidencia:</strong>
                    <p>${benefit.evidencia}</p>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

// Función para alternar detalles
function toggleDetails(button) {
    const details = button.nextElementSibling;
    details.classList.toggle('active');
    button.textContent = details.classList.contains('active') ? 'Ver menos ↑' : 'Ver más ↓';
}

// Función para renderizar timeline
function renderTimeline() {
    const container = document.getElementById('timeline-content');
    container.innerHTML = '';

    appData.pasos.forEach((paso, index) => {
        const item = document.createElement('div');
        item.className = 'timeline-item';
        item.innerHTML = `
            <div class="timeline-number">Paso ${index + 1}</div>
            <p>${paso}</p>
        `;
        container.appendChild(item);
    });
}

// Función para renderizar precauciones
function renderPrecautions() {
    const container = document.getElementById('precautions-grid');
    container.innerHTML = '';

    appData.precauciones.forEach((precaution) => {
        const card = document.createElement('div');
        card.className = 'precaution-card';
        card.innerHTML = `
            <div class="precaution-icon">${precaution.icono}</div>
            <h4>${precaution.titulo}</h4>
            <p>${precaution.descripcion}</p>
            <div class="precaution-recommendation">
                ✓ ${precaution.recomendacion}
            </div>
        `;
        container.appendChild(card);
    });
}

// Función para scroll suave
function scrollToSection(sectionId) {
    const element = document.getElementById(sectionId);
    if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
    }
}

// Función para scroll al inicio
function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Mostrar/ocultar botón "volver arriba"
window.addEventListener('scroll', () => {
    const backToTopBtn = document.getElementById('back-to-top');
    if (window.scrollY > 300) {
        backToTopBtn.classList.add('show');
    } else {
        backToTopBtn.classList.remove('show');
    }
});

// ==================== MENÚ HAMBURGUESA ====================
const hamburger = document.querySelector('.hamburger');
const navMenu = document.querySelector('.nav-menu');

if (hamburger) {
    hamburger.addEventListener('click', () => {
        navMenu.style.display = navMenu.style.display === 'flex' ? 'none' : 'flex';
        navMenu.style.position = 'absolute';
        navMenu.style.top = '60px';
        navMenu.style.left = '0';
        navMenu.style.right = '0';
        navMenu.style.backgroundColor = '#558B2F';
        navMenu.style.flexDirection = 'column';
        navMenu.style.width = '100%';
    });

    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            navMenu.style.display = 'none';
        });
    });
}

// ==================== INICIALIZACIÓN ====================
document.addEventListener('DOMContentLoaded', () => {
    renderBenefits(appData.beneficios_deficit_calorico, 'deficit-grid');
    renderBenefits(appData.beneficios_tdah, 'tdah-grid');
    renderBenefits(appData.beneficios_ayunas, 'ayunas-grid');
    renderTimeline();
    renderPrecautions();
});
