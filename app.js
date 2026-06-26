// ===== 1. CONFIGURACIÓN E INICIALIZACIÓN DE SUPABASE =====
const SUPABASE_URL = "https://coyqeidrpnmmwdumshid.supabase.co"; 
const SUPABASE_ANON_KEY = "sb_publishable_NOf7_vxVzHzjnpoyp5etQQ_IJig6a7P"; 

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const ADMIN_USER = "admin";
const ADMIN_PASS = "1234";

let html5QrcodeScanner = null; 
let intervalCupones = null;    

// ===== 2. CONTROL DE FLUJO AL CARGAR LA PÁGINA (window.onload) =====
window.onload = async function () {
  const { data: { session }, error } = await supabaseClient.auth.getSession();

  if (session && session.user) {
    localStorage.setItem("loggedUser", session.user.email);
    registrarEnListaLocal(session.user.email);

    if (session.user.email === ADMIN_USER) {
      localStorage.setItem("isAdmin", "true");
      showAdminPanel();
    } else {
      localStorage.setItem("isAdmin", "false");
      showApp();
    }
  } else {
    let localUser = localStorage.getItem("loggedUser");
    let localIsAdmin = localStorage.getItem("isAdmin");
    if (localUser === ADMIN_USER && localIsAdmin === "true") {
      showAdminPanel();
    } else {
      localStorage.removeItem("loggedUser");
      localStorage.removeItem("isAdmin");
      showLogin();
    }
  }

  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session && session.user) {
      localStorage.setItem("loggedUser", session.user.email);
      registrarEnListaLocal(session.user.email);
      
      if (session.user.email === ADMIN_USER) {
        localStorage.setItem("isAdmin", "true");
        showAdminPanel();
      } else {
        localStorage.setItem("isAdmin", "false");
        showApp();
      }
    }
    if (event === 'SIGNED_OUT') {
      localStorage.removeItem("loggedUser");
      localStorage.removeItem("isAdmin");
      if (intervalCupones) clearInterval(intervalCupones);
      showLogin();
    }
  });
};

// ===== 3. FUNCIONES DE AUTENTICACIÓN =====
async function loginWithGoogle() {
  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname }
  });
  if (error) alert("Error al conectar con Google: " + error.message);
}

async function register() {
  let email = document.getElementById("regUser").value.trim();
  let pass = document.getElementById("regPass").value.trim();

  if (!email || !pass) return alert("Completa los campos");

  if (!email.includes("@") || !email.includes(".")) {
    return alert("Por favor, introduce un correo electrónico válido.");
  }

  const { data, error } = await supabaseClient.auth.signUp({
    email: email,
    password: pass,
  });

  if (error) {
    return alert("Error al crear cuenta: " + error.message);
  }

  registrarEnListaLocal(email);
  
  const { error: loginErr } = await supabaseClient.auth.signInWithPassword({
    email: email,
    password: pass,
  });

  if (loginErr) {
    alert("Cuenta creada de forma segura. Inicia sesión en la pantalla anterior.");
    showLogin();
  } else {
    alert("¡Cuenta creada con éxito! Entrando a la app... 🎉");
  }

  document.getElementById("regUser").value = "";
  document.getElementById("regPass").value = "";
}

async function login() {
  let user = document.getElementById("loginUser").value.trim();
  let pass = document.getElementById("loginPass").value.trim();

  if (!user || !pass) return alert("Por favor ingresa usuario/email y contraseña");

  if (user === ADMIN_USER && pass === ADMIN_PASS) {
    localStorage.setItem("loggedUser", user);
    localStorage.setItem("isAdmin", "true");
    showAdminPanel();
    return;
  }

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: user,
    password: pass,
  });

  if (error) {
    return alert("Error de inicio de sesión: " + error.message);
  }
}

async function logout() {
  if (html5QrcodeScanner) detenerEscaneoCamara();
  try {
    await supabaseClient.auth.signOut();
  } catch(e) {}
  localStorage.clear();
  if (intervalCupones) clearInterval(intervalCupones);
  location.reload();
}

function registrarEnListaLocal(email) {
  let users = getUsers();
  if (!users[email]) {
    users[email] = "Protegida (Supabase Auth)"; 
    saveUsers(users);
  }
}

function getUsers() {
  return JSON.parse(localStorage.getItem("users")) || {};
}

function saveUsers(users) {
  localStorage.setItem("users", JSON.stringify(users));
}

// ===== 4. VISTAS Y INTERFAZ DOM =====
function showApp() {
  document.getElementById("login-section").style.display = "none";
  document.getElementById("register-section").style.display = "none";
  document.getElementById("app-section").style.display = "block";
  
  let adminSection = document.getElementById("admin-section");
  if (adminSection) adminSection.style.display = "none";
  
  const userDisplay = document.getElementById("userDisplay");
  if (userDisplay) userDisplay.innerText = "👤 Sesión: " + localStorage.getItem("loggedUser");
  
  renderCoupons();
}

function showLogin() {
  document.getElementById("login-section").style.display = "block";
  document.getElementById("register-section").style.display = "none";
  document.getElementById("app-section").style.display = "none";
  let adminSection = document.getElementById("admin-section");
  if (adminSection) adminSection.style.display = "none";
}

function showRegister() {
  document.getElementById("login-section").style.display = "none";
  document.getElementById("register-section").style.display = "block";
  document.getElementById("app-section").style.display = "none";
}

function showAdminPanel() {
  document.getElementById("login-section").style.display = "none";
  document.getElementById("register-section").style.display = "none";
  document.getElementById("app-section").style.display = "none";
  
  let adminSection = document.getElementById("admin-section");
  if (adminSection) adminSection.style.display = "block";
  
  renderUsers();
}

// ===== 5. LÓGICA DE RENDERS Y CUPONES =====
// ===== 5. LÓGICA DE RENDERS Y CUPONES =====
async function renderCoupons() {
  let list = document.getElementById("couponList");
  let userEmail = localStorage.getItem("loggedUser");
  
  if (!list || !userEmail || userEmail === "null") {
    if (list) list.innerHTML = "<p style='opacity:0.7'>Por favor, inicia sesión para ver tus cupones.</p>";
    return;
  }

  if (intervalCupones) clearInterval(intervalCupones);

  list.innerHTML = "<p style='opacity:0.7'>Buscando cupones activos... ⏳</p>";

  const { data: cupones, error: errorCupones } = await supabaseClient
    .from('Cupones')
    .select('*');

  const { data: canjeados, error: errorCanjes } = await supabaseClient
    .from('CuponesCanjeados')
    .select('codigo_cupon')
    .eq('usuario_email', userEmail);

  if (errorCupones || errorCanjes) {
    list.innerHTML = "<p style='opacity:0.7; color: #ff8a8a;'>Error al sincronizar con Supabase.</p>";
    return;
  }

  list.innerHTML = "";
  const codigosCanjeados = canjeados ? canjeados.map(c => c.codigo_cupon) : [];
  const elementosConContador = [];

  function actualizarFiltroyRelojes() {
    const ahora = new Date();
    const diaHoy = ahora.toLocaleDateString('es-ES', { weekday: 'long' }); 
    const diaHoyFormateado = diaHoy.charAt(0).toUpperCase() + diaHoy.slice(1);

    const cuponesVisibles = cupones.filter(cupon => {
      if (codigosCanjeados.includes(cupon.codigo)) return false; 
      
      const fechaFin = new Date(cupon.fecha_fin);
      if (ahora > fechaFin) return false; 

      if (cupon.dias_permitidos && cupon.dias_permitidos.length > 0) {
        return cupon.dias_permitidos.includes(diaHoyFormateado);
      }
      return true;
    });

    if (cuponesVisibles.length === 0) {
      list.innerHTML = "<p style='opacity:0.7'>No tienes cupones disponibles en este momento 🎟️</p>";
      return;
    }

    if (list.children.length === 0) {
      cuponesVisibles.forEach((cupon, index) => {
        const fechaInicioCupon = new Date(cupon.fecha_inicio);
        const estaEnEspera = ahora < fechaInicioCupon;
        const fechaObjetivo = fechaInicioCupon;

        let itemDiv = document.createElement("div");
        itemDiv.className = "coupon-item";
        itemDiv.id = `coupon-${index}`;
        
        if (estaEnEspera) {
          itemDiv.style.opacity = "0.55";
          itemDiv.style.filter = "grayscale(50%)";
          itemDiv.style.cursor = "not-allowed";
        }

        let badgeTexto = "";
        if (cupon.porcentaje_descuento !== null && cupon.porcentaje_descuento !== undefined) {
          badgeTexto = `-${cupon.porcentaje_descuento}%`;
        } else if (cupon.descripcion) {
          badgeTexto = cupon.descripcion;
        }

        let detalleInterno = cupon.descripcion ? `<b>Beneficio:</b> ${cupon.descripcion}<br>` : '';

        const clickAccion = estaEnEspera 
          ? `alert('Este cupón estará disponible próximamente en su fecha de inicio.')` 
          : `toggleCouponDesplegable('${index}')`;

        let tituloVisual = cupon.codigo;
        if (cupon.codigo.startsWith("BIENVENIDA-")) {
          tituloVisual = "🎁 Cupón de Bienvenida";
        }

        // 🚀 NUEVO: Cálculo exacto inicial incluyendo segundos
        let badgeInicial = badgeTexto + ' 👇';
        if (estaEnEspera) {
          const tiempoRestante = fechaObjetivo - ahora;
          const totalSegundos = Math.floor(tiempoRestante / 1000);
          const horas = Math.floor(totalSegundos / 3600);
          const minutos = Math.floor((totalSegundos % 3600) / 60);
          const segundos = totalSegundos % 60;
          
          badgeInicial = `⏳ Bloqueado (Activa en ${horas.toString().padStart(2, '0')}:${minutos.toString().padStart(2, '0')}:${segundos.toString().padStart(2, '0')})`;
        }

        itemDiv.innerHTML = `
          <div class="coupon-header" onclick="${clickAccion}">
            <span class="coupon-text">${tituloVisual}</span>
            <span id="badge-${index}" style="color: #ffeb3b; font-weight: bold; font-size: 13px; text-align: right; max-width: 60%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${badgeInicial}
            </span>
          </div>
          <div class="coupon-body" id="body-${index}">
            <div class="coupon-details">
              ${detalleInterno}
              <strong>Válido hasta:</strong> ${new Date(cupon.fecha_fin).toLocaleString('es-ES')}<br>
              Muestra este código QR en caja para aplicar tu beneficio.
            </div>
            <div class="qr-container" id="qr-${index}"></div>
          </div>
        `;

        list.appendChild(itemDiv);

        if (estaEnEspera) {
          elementosConContador.push({ index, fechaObjetivo, itemDiv, badgeTexto, codigo: cupon.codigo, userEmail });
        } else {
          generarQRUnico(index, userEmail, cupon.codigo);
        }
      });
    }

    elementosConContador.forEach(item => {
      const tiempoRestante = item.fechaObjetivo - new Date();

      if (tiempoRestante <= 0) {
        item.itemDiv.style.opacity = "1";
        item.itemDiv.style.filter = "none";
        item.itemDiv.style.cursor = "pointer";
        
        const header = item.itemDiv.querySelector('.coupon-header');
        header.setAttribute('onclick', `toggleCouponDesplegable('${item.index}')`);
        
        document.getElementById(`badge-${item.index}`).innerText = `${item.badgeTexto} 👇`;
        generarQRUnico(item.index, item.userEmail, item.codigo);
      } else {
        // 🚀 NUEVO: Desglose dinámico en tiempo real que mide Horas, Minutos y Segundos
        const totalSegundos = Math.floor(tiempoRestante / 1000);
        const horas = Math.floor(totalSegundos / 3600);
        const minutos = Math.floor((totalSegundos % 3600) / 60);
        const segundos = totalSegundos % 60;

        const horasStr = horas.toString().padStart(2, '0');
        const minutesStr = minutos.toString().padStart(2, '0');
        const segundosStr = segundos.toString().padStart(2, '0');

        document.getElementById(`badge-${item.index}`).innerText = `⏳ Bloqueado (Activa en ${horasStr}:${minutesStr}:${segundosStr})`;
      }
    });
  }

  actualizarFiltroyRelojes();
  // 🚀 CAMBIO CLAVE: Cambiado de 10000 a 1000 para que refresque CADA SEGUNDO
  intervalCupones = setInterval(actualizarFiltroyRelojes, 1000); 
}

function generarQRUnico(index, email, codigo) {
  const contenedorQR = document.getElementById(`qr-${index}`);
  if (contenedorQR && contenedorQR.children.length === 0) {
    const stringQR = `${email}|${codigo}`;
    new QRCode(contenedorQR, {
      text: stringQR,
      width: 130,
      height: 130,
      colorDark : "#000000",
      colorLight : "#ffffff",
      correctLevel : QRCode.CorrectLevel.H
    });
  }
}

function toggleCouponDesplegable(index) {
  const elemento = document.getElementById(`coupon-${index}`);
  if (!elemento) return;
  const body = document.getElementById(`body-${index}`);
  if (!body) return;

  const yaAbierto = elemento.classList.contains("open");
  
  document.querySelectorAll('.coupon-item').forEach(item => {
    item.classList.remove("open");
    const b = item.querySelector('.coupon-body');
    if (b) {
      b.style.maxHeight = "0px";
      b.style.padding = "0px";
    }
  });

  if (!yaAbierto) {
    elemento.classList.add("open");
    body.style.maxHeight = "300px";
    body.style.padding = "14px";
  }
}

// ===== 6. PANEL DE ADMINISTRADOR & ESCÁNER =====
function iniciarEscaneoCamara() {
  if (html5QrcodeScanner) {
    alert("La cámara ya está encendida.");
    return;
  }

  if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    alert("⚠️ Para activar la cámara desde el móvil, necesitas ingresar mediante HTTPS.");
    return;
  }

  html5QrcodeScanner = new Html5Qrcode("reader");
  const config = { fps: 10, qrbox: { width: 250, height: 250 } };

  html5QrcodeScanner.start(
    { facingMode: "environment" }, 
    config,
    onQrScanSuccess
  ).catch(err => {
    alert("Error al acceder a la cámara: " + err);
    html5QrcodeScanner = null;
  });
}

async function onQrScanSuccess(decodedText) {
  if (!decodedText.includes("|")) {
    alert("Código QR inválido para el sistema.");
    return;
  }

  detenerEscaneoCamara();
  const [emailUsuario, codigoCupon] = decodedText.split("|");

  const confirmar = confirm(`¿Canjear cupón '${codigoCupon}' al usuario ${emailUsuario}?`);
  if (!confirmar) {
    iniciarEscaneoCamara();
    return;
  }

  const { error } = await supabaseClient
    .from('CuponesCanjeados')
    .insert([
      {
        usuario_email: emailUsuario,
        codigo_cupon: codigoCupon
      }
    ]);

  if (error) {
    alert("Error al procesar el canje en Supabase: " + error.message);
    iniciarEscaneoCamara();
    return;
  }

  alert(`¡Éxito! El cupón '${codigoCupon}' fue procesado y removido de la cuenta de ${emailUsuario}.`);
  iniciarEscaneoCamara();
}

function detenerEscaneoCamara() {
  if (html5QrcodeScanner) {
    html5QrcodeScanner.stop().then(() => {
      html5QrcodeScanner = null;
      document.getElementById("reader").innerHTML = ""; 
    }).catch(err => console.error("Error al apagar cámara", err));
  }
}

async function crearCuponAdminSupabase() {
  const codigo = document.getElementById("newCouponCode").value.trim().toUpperCase();
  const descuentoRaw = document.getElementById("newCouponDiscount").value;
  const descripcion = document.getElementById("newCouponDescription").value.trim();
  const fechaInicio = document.getElementById("newCouponStart").value;
  const fechaFin = document.getElementById("newCouponEnd").value;

  const checkboxes = document.querySelectorAll('input[name="couponDays"]:checked');
  const diasPermitidos = Array.from(checkboxes).map(cb => cb.value);

  if (!codigo || !fechaInicio || !fechaFin) {
    return alert("Por favor, completa obligatoriamente el código y ambas fechas.");
  }

  if (!descuentoRaw && !descripcion) {
    return alert("Debes rellenar al menos el porcentaje de descuento o una descripción del beneficio.");
  }

  const descuento = descuentoRaw ? parseInt(descuentoRaw) : null;
  const diasFormateadosPostgres = diasPermitidos.length > 0 ? `{${diasPermitidos.join(',')}}` : null;

  const { data, error } = await supabaseClient
    .from('Cupones')
    .insert([
      {
        codigo: codigo,
        porcentaje_descuento: descuento,
        descripcion: descripcion || null,
        fecha_inicio: new Date(fechaInicio).toISOString(),
        fecha_fin: new Date(fechaFin).toISOString(),
        dias_permitidos: diasFormateadosPostgres
      }
    ]);

  if (error) {
    return alert("Error al conectar con Supabase: " + error.message);
  }

  alert(`¡Cupón '${codigo}' guardado exitosamente en Supabase!`);

  document.getElementById("newCouponCode").value = "";
  document.getElementById("newCouponDiscount").value = "";
  document.getElementById("newCouponDescription").value = "";
  document.getElementById("newCouponStart").value = "";
  document.getElementById("newCouponEnd").value = "";
  checkboxes.forEach(cb => cb.checked = false);
}

function renderUsers() {
  let users = getUsers();
  let list = document.getElementById("usersList");
  if (!list) return;
  let searchInput = document.getElementById("searchUser");
  let search = searchInput ? searchInput.value.toLowerCase() : "";

  list.innerHTML = "";
  let filtered = Object.keys(users).filter(user => user.toLowerCase().includes(search));

  if (filtered.length === 0) {
    list.innerHTML = "<li>No se encontraron usuarios</li>";
    return;
  }

  filtered.forEach(user => {
    let li = document.createElement("li");
    li.innerHTML = `
      <span>👤 <b>${user}</b> - 🔑 <span style="opacity:0.6; font-style:italic;">[Autenticación Protegida]</span></span>
      <button onclick="deleteUser('${user}')" class="delete-btn" style="margin-left: 10px;">Eliminar</button>
    `;
    list.appendChild(li);
  });
}

function deleteUser(user) {
  let users = getUsers();
  if (!users[user]) return;

  let confirmDelete = confirm("¿Seguro que quieres eliminar a " + user + "?");
  if (!confirmDelete) return;

  delete users[user];
  saveUsers(users);

  localStorage.removeItem("coupons_" + user);
  renderUsers();
}