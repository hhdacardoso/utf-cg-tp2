"use strict"; // ReferenceError em caso de variável não declarada

const m4 = twgl.m4;

const ARQUIVOS_OBJ = {
  arvore : {
    obj:"models/tree.obj",
    textura: "models/Textures/colormap.png",
  },
  personagem: { 
    obj: "models/personagem.obj",
    textura: "models/Textures/Atlas_Pirate.png" 
  },
};

// Tronco caído: cilindro deitado ao longo do eixo X
const TRONCO = { x: 0.2, z: 2.0, raio: 0.38, comprimento: 2.0 };

// Matriz de modelo a partir de posição, rotação (rad) e escala.
// Ordem: T * Ry * Rx * Rz * S
function criarMatrizModelo({ position, rotation, scale }) {
  let m = m4.translation(position);
  m = m4.multiply(m, m4.rotationY(rotation[1]));
  m = m4.multiply(m, m4.rotationX(rotation[0]));
  m = m4.multiply(m, m4.rotationZ(rotation[2]));
  m = m4.multiply(m, m4.scaling(scale));
  return m;
}

async function carregarShader(url) {
  const resposta = await fetch(url);
  if (!resposta.ok) throw new Error(`Falha ao carregar ${url}`);
  return await resposta.text();
}

// Material padrão: reproduz a iluminação simples anterior (sem brilho)
const MATERIAL_PADRAO = { ambient: 0.3, diffuse: 0.7, specular: 0.0, shininess: 32 };

// Materiais reutilizáveis.
// ambient/diffuse: quanto de cada luz o material absorve;
// specular/shininess: intensidade e concentração do brilho.
const MATERIAIS = {
  fosco: MATERIAL_PADRAO,
  folha: { ambient: 0.3, diffuse: 0.7, specular: 0.05, shininess: 8 },
  pedra: { ambient: 0.3, diffuse: 0.7, specular: 0.15, shininess: 16 },
  madeira: { ambient: 0.3, diffuse: 0.7, specular: 0.1, shininess: 16 },
  parede: { ambient: 0.3, diffuse: 0.7, specular: 0.05, shininess: 8 },
  telha: { ambient: 0.3, diffuse: 0.7, specular: 0.25, shininess: 32 },
  tecido: { ambient: 0.35, diffuse: 0.65, specular: 0.0, shininess: 1 },
  metal: { ambient: 0.25, diffuse: 0.6, specular: 0.8, shininess: 64 },
  agua: { ambient: 0.3, diffuse: 0.7, specular: 0.9, shininess: 128 },
  pokebola: { ambient: 0.3, diffuse: 0.7, specular: 0.5, shininess: 64 },
  arvore: { ambient: 0.3, diffuse: 0.7, specular: 0.05, shininess: 8 },
  personagem: { ambient: 0.3, diffuse: 0.7, specular: 0.2, shininess: 16 },
};

// Cria um objeto de cena com valores padrão
function criarObjeto({
  bufferInfo = null,           // null = nó vazio (pivô)
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = [1, 1, 1],
  color = [1, 1, 1, 1],
  texture = null,
  material = MATERIAL_PADRAO,
  filhos = [],
}) {
  return { bufferInfo, position, rotation, scale, color, texture, material, filhos };
}

// ---------- Câmeras ----------
const camState = {
  ativa: 1,                      // 1 = automática, 2 = orbital
  raio: 12,                      // distância ao alvo (scroll)
  yaw: 0.8,                      // câmera 2 (rad)
  pitch: 0.5,                    // câmera 2 (rad)
  alvo: [0, 0, 0],
};
const RAIO_MIN = 4;
const RAIO_MAX = 30;
const ELEVACAO_AUTO = Math.PI / 4;            // 45°
const VELOCIDADE_AUTO = 0.3;                  // rad/s
const PITCH_MAX = (85 * Math.PI) / 180;

// Posição do olho em coordenadas esféricas ao redor do alvo
function posicaoOlho(yaw, pitch, raio, alvo) {
  return [
    alvo[0] + raio * Math.cos(pitch) * Math.cos(yaw),
    alvo[1] + raio * Math.sin(pitch),
    alvo[2] + raio * Math.cos(pitch) * Math.sin(yaw),
  ];
}

function calcularOlho(time) {
  const yaw = camState.ativa === 1 ? time * VELOCIDADE_AUTO : camState.yaw;
  const pitch = camState.ativa === 1 ? ELEVACAO_AUTO : camState.pitch;
  return posicaoOlho(yaw, pitch, camState.raio, camState.alvo);
}

function calcularView(olho) {
  const camera = m4.lookAt(olho, camState.alvo, [0, 1, 0]);
  return m4.inverse(camera);
}

const NOMES_CAMERA = {
  1: "1 (automática)",
  2: "2 (orbital)",
};

function configurarControles(canvas) {
  const hudCamera = document.getElementById("camera-ativa");

  function selecionarCamera(n) {
    console.log("Camera ativa " + n); // Teste do listener
    camState.ativa = n;
    hudCamera.textContent = NOMES_CAMERA[n];
  }
  selecionarCamera(camState.ativa); // texto inicial

  window.addEventListener("keydown", (e) => {
    if (e.key === "1" || e.code === "Digit1" || e.code === "Numpad1") {
      selecionarCamera(1);
    }
    if (e.key === "2" || e.code === "Digit2" || e.code === "Numpad2") {
      selecionarCamera(2);
    }
  });

  // Scroll: aproxima/afasta (vale para as duas câmeras)
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      camState.raio *= 1 + e.deltaY * 0.001;
      camState.raio = Math.min(RAIO_MAX, Math.max(RAIO_MIN, camState.raio));
    },
    { passive: false }
  );

  // Mouse: orbita a câmera 2 enquanto o botão esquerdo está pressionado
  canvas.addEventListener("pointermove", (e) => {
    if (camState.ativa !== 2 || !(e.buttons & 1)) return;
    camState.yaw -= e.movementX * 0.005;
    camState.pitch += e.movementY * 0.005;
    camState.pitch = Math.min(PITCH_MAX, Math.max(-PITCH_MAX, camState.pitch));
  });
}

// Disco no plano XZ (y = 0), normal +Y, centrado na origem.
// Triângulos em sentido anti-horário visto de cima (compatível com CULL_FACE).
function criarDisco(gl, raio, segmentos = 64) {
  const position = [0, 0, 0];
  const normal = [0, 1, 0];
  const texcoord = [0.5, 0.5];
  const indices = [];

  for (let i = 0; i < segmentos; i++) {
    const a = (i / segmentos) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    position.push(raio * c, 0, raio * s);
    normal.push(0, 1, 0);
    texcoord.push(0.5 + 0.5 * c, 0.5 + 0.5 * s); // projeção planar
  }

  for (let i = 0; i < segmentos; i++) {
    const atual = 1 + i;
    const proximo = 1 + ((i + 1) % segmentos);
    indices.push(0, proximo, atual);
  }

  return twgl.createBufferInfoFromArrays(gl, {
    position: { numComponents: 3, data: position },
    normal: { numComponents: 3, data: normal },
    texcoord: { numComponents: 2, data: texcoord },
    indices: indices,
  });
}

// Textura do chão desenhada em canvas: gramado + anel branco + faixa preta.
function criarTexturaChao(gl, tamanho = 1024) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = tamanho;
  const ctx = cv.getContext("2d");
  const c = tamanho / 2;

  // Fundo: faixa preta (borda)
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(0, 0, tamanho, tamanho);

  // Anel branco fino
  ctx.fillStyle = "#f2f2f2";
  ctx.beginPath();
  ctx.arc(c, c, c * 0.88, 0, Math.PI * 2);
  ctx.fill();

  // Gramado
  ctx.fillStyle = "#4caf50";
  ctx.beginPath();
  ctx.arc(c, c, c * 0.84, 0, Math.PI * 2);
  ctx.fill();

  // Manchas de variação na grama (só dentro do gramado)
  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, c * 0.84, 0, Math.PI * 2);
  ctx.clip();
  for (let i = 0; i < 2500; i++) {
    const x = Math.random() * tamanho;
    const y = Math.random() * tamanho;
    const r = 2 + Math.random() * 6;
    ctx.fillStyle = Math.random() < 0.5 ? "#3f9a44" : "#5dbb63";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  return twgl.createTexture(gl, { src: cv, min: gl.LINEAR_MIPMAP_LINEAR });
}

// Hemisfério inferior (y <= 0), centrado na origem, equador em y = 0.
// phi: latitude, 0 = equador, 90° = polo inferior.
function criarHemisferio(gl, raio, stacks = 24, slices = 64) {
  const position = [];
  const normal = [];
  const texcoord = [];
  const indices = [];

  for (let i = 0; i <= stacks; i++) {
    const phi = (i / stacks) * (Math.PI / 2);
    const cp = Math.cos(phi);
    const sp = Math.sin(phi);

    for (let j = 0; j <= slices; j++) {
      const a = (j / slices) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);

      // Normal = direção do centro até o vértice (esfera centrada na origem)
      const nx = cp * ca;
      const ny = -sp;
      const nz = cp * sa;

      position.push(raio * nx, raio * ny, raio * nz);
      normal.push(nx, ny, nz);
      texcoord.push(j / slices, i / stacks); // v: 0 = equador, 1 = polo
    }
  }

  // j = slices repete o vértice de j = 0 (costura da textura)
  const colunas = slices + 1;
  for (let i = 0; i < stacks; i++) {
    for (let j = 0; j < slices; j++) {
      const A = i * colunas + j;
      const B = A + 1;
      const C = A + colunas;
      const D = C + 1;
      indices.push(A, B, C); // anti-horário visto de fora
      indices.push(B, D, C);
    }
  }

  return twgl.createBufferInfoFromArrays(gl, {
    position: { numComponents: 3, data: position },
    normal: { numComponents: 3, data: normal },
    texcoord: { numComponents: 2, data: texcoord },
    indices: indices,
  });
}

// Textura 2048x512: u percorre a circunferência, v vai do equador (topo) ao polo.
// Com raio 6, os pixels por unidade de mundo ficam iguais nos dois eixos.
function criarTexturaHemisferio(gl) {
  const W = 2048;
  const H = 512;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d");

  // Corpo branco
  ctx.fillStyle = "#f4f4f4";
  ctx.fillRect(0, 0, W, H);

  // Faixa preta no equador (topo da imagem)
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(0, 0, W, 56);

  // Botão central em u = 0 (desenhado nas duas pontas para fechar a costura).
  // Só a metade de baixo do círculo aparece, que é a que cabe no hemisfério.
  for (const cx of [0, W]) {
    const circulo = (r, cor) => {
      ctx.fillStyle = cor;
      ctx.beginPath();
      ctx.arc(cx, 0, r, 0, Math.PI * 2);
      ctx.fill();
    };
    circulo(100, "#1a1a1a"); // aro preto
    circulo(72, "#f4f4f4");  // branco
    circulo(48, "#cfcfcf");  // miolo cinza
  }

  return twgl.createTexture(gl, {
    src: cv,
    min: gl.LINEAR_MIPMAP_LINEAR,
    wrapS: gl.REPEAT,
    wrapT: gl.CLAMP_TO_EDGE,
  });
}

// Cria uma textura desenhando em um canvas (repete nas bordas)
function criarTexturaCanvas(gl, largura, altura, desenhar) {
  const cv = document.createElement("canvas");
  cv.width = largura;
  cv.height = altura;
  desenhar(cv.getContext("2d"), largura, altura);

  return twgl.createTexture(gl, {
    src: cv,
    min: gl.LINEAR_MIPMAP_LINEAR,
    wrapS: gl.REPEAT,
    wrapT: gl.REPEAT,
  });
}

// Espalha manchas circulares aleatórias, sorteando a cor de uma lista
function espalharManchas(ctx, w, h, quantidade, rMin, rMax, cores) {
  for (let i = 0; i < quantidade; i++) {
    ctx.fillStyle = cores[Math.floor(Math.random() * cores.length)];
    ctx.beginPath();
    ctx.arc(
      Math.random() * w,
      Math.random() * h,
      rMin + Math.random() * (rMax - rMin),
      0,
      Math.PI * 2
    );
    ctx.fill();
  }
}

// Folhagem: verde com manchas claras e escuras (arbustos)
function criarTexturaFolhas(gl) {
  return criarTexturaCanvas(gl, 512, 256, (ctx, w, h) => {
    ctx.fillStyle = "#2e7d32";
    ctx.fillRect(0, 0, w, h);
    espalharManchas(ctx, w, h, 1500, 4, 10, [
      "#1b5e20", "#388e3c", "#43a047", "#2e7d32",
    ]);
  });
}

// Pedra: cinza com manchas e algumas rachaduras
function criarTexturaPedra(gl) {
  return criarTexturaCanvas(gl, 512, 256, (ctx, w, h) => {
    ctx.fillStyle = "#8a8a8e";
    ctx.fillRect(0, 0, w, h);
    espalharManchas(ctx, w, h, 1200, 3, 14, [
      "#707074", "#9a9a9e", "#7c7c80", "#a8a8ac",
    ]);

    ctx.strokeStyle = "#4a4a4e";
    ctx.lineWidth = 2;
    for (let i = 0; i < 10; i++) {
      let x = Math.random() * w;
      let y = Math.random() * h;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let j = 0; j < 5; j++) {
        x += (Math.random() - 0.5) * 40;
        y += (Math.random() - 0.5) * 40;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  });
}

// Madeira: tábuas verticais separadas por frestas, com veios
function criarTexturaMadeira(gl) {
  return criarTexturaCanvas(gl, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#8b5a2b";
    ctx.fillRect(0, 0, w, h);

    // Veios: linhas verticais finas, claras e escuras
    for (let i = 0; i < 140; i++) {
      ctx.strokeStyle = Math.random() < 0.5 ? "#7a4e22" : "#9c6a35";
      ctx.lineWidth = 1 + Math.random() * 2;
      const x = Math.random() * w;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + (Math.random() - 0.5) * 6, h);
      ctx.stroke();
    }

    // Frestas entre as tábuas
    ctx.fillStyle = "#4a2e12";
    for (let x = 0; x < w; x += 32) {
      ctx.fillRect(x, 0, 3, h);
    }
  });
}

// Parede do moinho: reboco claro e manchado
function criarTexturaParede(gl) {
  return criarTexturaCanvas(gl, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#e8dcc0";
    ctx.fillRect(0, 0, w, h);
    espalharManchas(ctx, w, h, 800, 2, 8, [
      "#ddd0b0", "#efe5cc", "#d6c8a6",
    ]);
  });
}

// Telhado do moinho: fileiras de telhas, cada uma deslocada da anterior
function criarTexturaTelha(gl) {
  return criarTexturaCanvas(gl, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#8e2f22";
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = "#5a1a12";
    const altura = 32;
    const largura = 32;
    for (let linha = 0; linha < h / altura; linha++) {
      const y = linha * altura;
      ctx.fillRect(0, y, w, 3);
      const deslocamento = linha % 2 === 0 ? 0 : largura / 2;
      for (let x = deslocamento; x < w; x += largura) {
        ctx.fillRect(x, y, 2, altura);
      }
    }
  });
}

// Tecido das velas: trama fina em quadriculado
function criarTexturaTecido(gl) {
  return criarTexturaCanvas(gl, 128, 128, (ctx, w, h) => {
    ctx.fillStyle = "#f2efe6";
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = "rgba(0, 0, 0, 0.07)";
    for (let i = 0; i < w; i += 8) {
      ctx.fillRect(i, 0, 1, h);
      ctx.fillRect(0, i, w, 1);
    }
  });
}

// Água da lagoa: azul com variações de tom e marcas de ondulação
function criarTexturaAgua(gl) {
  return criarTexturaCanvas(gl, 512, 512, (ctx, w, h) => {
    ctx.fillStyle = "#2a6fb8";
    ctx.fillRect(0, 0, w, h);

    ctx.globalAlpha = 0.35;
    espalharManchas(ctx, w, h, 60, 20, 60, ["#3b86d1", "#1f5fa5"]);

    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    for (let i = 0; i < 80; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      ctx.beginPath();
      ctx.ellipse(x, y, 8 + Math.random() * 14, 3 + Math.random() * 4, 0, 0, Math.PI);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  });
}

async function carregarTexto(url) {
  const resposta = await fetch(url);
  if (!resposta.ok) throw new Error(`Falha ao carregar ${url}`);
  return await resposta.text();
}

async function carregarModelos(gl, arquivos) {
  const nomes = Object.keys(arquivos);
  const textos = await Promise.all(nomes.map((n) => carregarTexto(arquivos[n].obj)));

  const modelos = {};
  nomes.forEach((nome, i) => {
    const bufferInfo = twgl.createBufferInfoFromArrays(gl, parseObj(textos[i]));
    const texture = arquivos[nome].textura
      ? twgl.createTexture(gl, {
          src: arquivos[nome].textura,
          min: gl.NEAREST, // paleta de cores: sem mistura entre vizinhas
          mag: gl.NEAREST,
          flipY: true,
        })
      : null;
    modelos[nome] = { bufferInfo, texture };
  });
  return modelos;
}

// Converte o texto de um .obj em arrays prontos para o TWGL.
// Suporta faces v, v/vt, v//vn e v/vt/vn, índices negativos e polígonos
// com mais de 3 vértices (triangulados em leque).
function parseObj(texto) {
  const pos = [];  // posições lidas ([x, y, z])
  const uv = [];   // coordenadas de textura ([u, v])
  const nor = [];  // normais ([x, y, z])

  const position = [];
  const normal = [];
  const texcoord = [];
  const indices = [];
  const cache = new Map(); // "v/vt/vn" -> índice final (evita duplicar vértices)

  // Converte o índice do OBJ (base 1, ou negativo = relativo ao fim) para base 0
  const resolver = (s, tamanho) => {
    if (!s) return -1;
    const n = parseInt(s, 10);
    return n > 0 ? n - 1 : tamanho + n;
  };

  // Gera (ou reaproveita) o vértice final correspondente a "v/vt/vn"
  function vertice(token) {
    if (cache.has(token)) return cache.get(token);

    const [sv, svt, svn] = token.split("/");
    const p = pos[resolver(sv, pos.length)];
    const t = uv[resolver(svt, uv.length)] || [0, 0];
    const n = nor[resolver(svn, nor.length)] || [0, 1, 0];

    position.push(p[0], p[1], p[2]);
    texcoord.push(t[0], t[1]);
    normal.push(n[0], n[1], n[2]);

    const idx = position.length / 3 - 1;
    cache.set(token, idx);
    return idx;
  }

  for (const linha of texto.split("\n")) {
    const partes = linha.trim().split(/\s+/);
    const tipo = partes[0];

    if (tipo === "v") {
      // Pode haver 3 números extras de cor (x y z r g b): ignorados
      pos.push([+partes[1], +partes[2], +partes[3]]);
    } else if (tipo === "vt") {
      uv.push([+partes[1], +partes[2]]);
    } else if (tipo === "vn") {
      nor.push([+partes[1], +partes[2], +partes[3]]);
    } else if (tipo === "f") {
      const idx = partes.slice(1).map(vertice);
      // Triangulação em leque: (0,1,2), (0,2,3), (0,3,4)...
      for (let i = 1; i < idx.length - 1; i++) {
        indices.push(idx[0], idx[i], idx[i + 1]);
      }
    }
  }

  return {
    position: { numComponents: 3, data: position },
    normal: { numComponents: 3, data: normal },
    texcoord: { numComponents: 2, data: texcoord },
    indices: indices,
  };
}

function criarMoinho(gl, texturas, posicao) {
  const bufCubo = twgl.primitives.createCubeBufferInfo(gl, 1);
  const bufEsfera = twgl.primitives.createSphereBufferInfo(gl, 1, 16, 12);
  const bufTorre = twgl.primitives.createTruncatedConeBufferInfo(gl, 0.8, 0.5, 2.4, 24, 1);
  const bufTelhado = twgl.primitives.createTruncatedConeBufferInfo(gl, 0.65, 0, 0.7, 24, 1);

  // Uma pá = pivô girado em Z, com braço e vela como filhos
  const criarPa = (angulo) =>
    criarObjeto({
      rotation: [0, 0, angulo],
      filhos: [
        criarObjeto({
          bufferInfo: bufCubo,
          position: [0, 0.85, 0],
          scale: [0.07, 1.7, 0.07],
          texture: texturas.madeira,
          material: MATERIAIS.madeira,
        }),
        criarObjeto({
          bufferInfo: bufCubo,
          position: [0.2, 1.05, 0.03],
          scale: [0.3, 1.1, 0.03],
          texture: texturas.tecido,
          material: MATERIAIS.tecido,
        }),
      ],
    });

  // Eixo: no topo da torre, na frente. É ele que gira.
  const eixo = criarObjeto({
    position: [0, 2.1, 0.62],
    filhos: [
      criarObjeto({
        bufferInfo: bufEsfera,
        scale: [0.15, 0.15, 0.15],
        texture: texturas.madeira,
        material: MATERIAIS.madeira,
      }),
      criarPa(0),
      criarPa(Math.PI / 2),
      criarPa(Math.PI),
      criarPa((3 * Math.PI) / 2),
    ],
  });

  // Raiz: orientada para o centro do diorama (+Z local aponta para o centro)
  const raiz = criarObjeto({
    position: posicao,
    rotation: [0, Math.atan2(-posicao[0], -posicao[2]), 0],
    filhos: [
      criarObjeto({
        bufferInfo: bufTorre,
        position: [0, 1.2, 0], // metade da altura 2.4
        texture: texturas.parede,
        material: MATERIAIS.parede,
      }),
      criarObjeto({
        bufferInfo: bufTelhado,
        position: [0, 2.75, 0], // 2.4 + metade de 0.7
        texture: texturas.telha,
        material: MATERIAIS.telha,
      }),
      eixo,
    ],
  });

  return { raiz, eixo };
}

// Corrige a direção "frente" nativa do modelo para que ela vire +Z (ver tabela)
const OFFSET_FRENTE = 0;
const ESCALA_PERSONAGEM = 1.5;

// Convenção das poses: yaw 0 = olhando para +Z; rotation = [pitch, yaw, roll]
const POSES = [
  {
    nome: "em pé, olhando a lagoa",
    pos: [0, 0, 0],
    rot: [0, Math.atan2(-2.5, -1.5), 0],
  },
  {
    nome: "deitado de barriga para cima",
    pos: [0, 0.4, 0],            // ajuste o 0.4 se afundar ou flutuar
    rot: [-Math.PI / 2, -Math.PI / 2, 0],
  },
  {
    nome: "sentado no tronco",
    // quadril (≈0.38 do modelo × escala) na altura do topo do tronco
    pos: [TRONCO.x, 2 * TRONCO.raio - 0.38 * ESCALA_PERSONAGEM + 0.4, TRONCO.z - 0.3],
    rot: [0, Math.PI, 0], // de frente para o centro do diorama
  },
];

// Menor diferença entre dois ângulos, em [-π, π]
function angCurto(de, para) {
  let d = (para - de) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

// Aproxima suavemente o personagem da pose-alvo (suavização exponencial)
function atualizarPose(personagem, alvo, dt) {
  const k = 1 - Math.exp(-6 * dt);
  for (let i = 0; i < 3; i++) {
    personagem.position[i] += (alvo.pos[i] - personagem.position[i]) * k;
    personagem.rotation[i] += angCurto(personagem.rotation[i], alvo.rot[i]) * k;
  }
}

async function main() {
  // 1.Contexto e inicialização
  const canvas = document.getElementById("canvas");
  const gl = canvas.getContext("webgl2");
  if (!gl) {
    alert("Seu navegador não suporta WebGL2.");
    return;
  }

  // Check do load da TWGL
  if (typeof twgl === "undefined") {
    console.error("TWGL não carregou.");
    return;
  }

  gl.enable(gl.DEPTH_TEST); // z-buffer
  gl.enable(gl.CULL_FACE);  // descarta faces de trás (antihorário = frente)
  gl.clearColor(0.53, 0.81, 0.92, 1.0); // céu azul claro
  
  twgl.setDefaults({ attribPrefix: "a_" });
  configurarControles(canvas);

  // 2. Shaders
  const [vs, fs] = await Promise.all([
    carregarShader("shaders/vertex.glsl"),
    carregarShader("shaders/fragment.glsl"),
  ]);
  const programInfo = twgl.createProgramInfo(gl, [vs, fs]);

  // Carregamento dos modelos dos objetos da cena
  const modelos = await carregarModelos(gl, ARQUIVOS_OBJ);
  
  // 3. Textura branca 1x1 (para objetos sem textura)
  const texBranca = twgl.createTexture(gl, {
    src: [255, 255, 255, 255],
    min: gl.NEAREST,
    mag: gl.NEAREST,
  });
  // Texturas procedurais do cenário
  const texturas = {
    folhas: criarTexturaFolhas(gl),
    pedra: criarTexturaPedra(gl),
    madeira: criarTexturaMadeira(gl),
    parede: criarTexturaParede(gl),
    telha: criarTexturaTelha(gl),
    tecido: criarTexturaTecido(gl),
    agua: criarTexturaAgua(gl),
  };

  // 4. Cena
  const cena = [];

  // Inserção da árvore
  cena.push(
    criarObjeto({
      bufferInfo:modelos.arvore.bufferInfo,
      texture:modelos.arvore.texture,
      position:[2.5, 0, 1],
      scale:[3, 3, 3],
      material: MATERIAIS.arvore,
    })
  );

  // Inserção do personagem
  const personagem = criarObjeto({
    position: [...POSES[0].pos],
    rotation: [...POSES[0].rot],
    filhos: [
      criarObjeto({
        bufferInfo: modelos.personagem.bufferInfo,
        texture: modelos.personagem.texture,
        rotation: [0, OFFSET_FRENTE, 0],
        scale: [ESCALA_PERSONAGEM, ESCALA_PERSONAGEM, ESCALA_PERSONAGEM],
        material: MATERIAIS.personagem,
      }),
    ],
  });
  cena.push(personagem);

  // Tecla P: avança para a próxima pose
  let poseAtual = 0;
  const hudPose = document.getElementById("pose-atual");
  hudPose.textContent = POSES[poseAtual].nome;
  window.addEventListener("keydown", (e) => {
    if (e.code === "KeyP") {
      poseAtual = (poseAtual + 1) % POSES.length;
      hudPose.textContent = POSES[poseAtual].nome;
    }
  });

  // Tecla L: liga/desliga o modelo de iluminação
  let luzLigada = true;
  const hudLuz = document.getElementById("luz-estado");
  hudLuz.textContent = "ligada";
  window.addEventListener("keydown", (e) => {
    if (e.code === "KeyL") {
      luzLigada = !luzLigada;
      hudLuz.textContent = luzLigada ? "ligada" : "desligada";
    }
  });

  let tempoAnterior = 0;

  // ---------- Cenário (primitivas) ----------
// Buffers unitários compartilhados; o tamanho de cada instância vem do `scale`.
const bufEsfera = twgl.primitives.createSphereBufferInfo(gl, 1, 24, 16);   // raio 1
const bufCilindro = twgl.primitives.createCylinderBufferInfo(gl, 1, 1, 24, 1); // raio 1, altura 1
const bufLagoa = criarDisco(gl, 1, 48);                                    // raio 1

// Lagoa: disco azul um pouco acima do chão (y = 0.02) para evitar z-fighting
cena.push(
  criarObjeto({
    bufferInfo: bufLagoa,
    position: [-2.5, 0.02, -1.5],
    scale: [1.8, 1, 1.8], // raio 1.8
    texture: texturas.agua,
    material: MATERIAIS.agua,
  })
);

cena.push(
  criarObjeto({
    bufferInfo: bufCilindro,
    position: [TRONCO.x, TRONCO.raio, TRONCO.z],
    rotation: [0, 0, Math.PI / 2], // deita o cilindro: eixo Y vira eixo X
    scale: [TRONCO.raio, TRONCO.comprimento, TRONCO.raio],
    texture: texturas.madeira,
    material: MATERIAIS.madeira,
  })
);

// Arbustos: esferas achatadas, parcialmente enterradas no chão
const arbustos = [
  { x: 3.6, z: -2.2, r: 0.7 },
  { x: -4.0, z: 1.5, r: 0.6 },
  { x: 1.0, z: -4.0, r: 0.65 },
  { x: 0.5, z: 4.0, r: 0.7 },
  { x: 3.7, z: 2.4, r: 0.55 },
  { x: -1.2, z: -3.4, r: 0.5 },
];
for (const a of arbustos) {
  cena.push(
    criarObjeto({
      bufferInfo: bufEsfera,
      position: [a.x, a.r * 0.45, a.z],
      scale: [a.r, a.r * 0.7, a.r],
      texture: texturas.folhas,
      material: MATERIAIS.folha,
    })
  );
}

// Pedras: esferas achatadas e irregulares, cinza, com rotações diferentes
const pedras = [
  { x: 1.8, z: -2.5, s: [0.45, 0.3, 0.38], giro: 0.4 },
  { x: -0.8, z: -3.7, s: [0.35, 0.25, 0.3], giro: 1.2 },
  { x: 3.2, z: -0.6, s: [0.5, 0.35, 0.4], giro: 2.1 },
  { x: -4.2, z: -0.3, s: [0.4, 0.28, 0.35], giro: 0.9 },
];
for (const p of pedras) {
  cena.push(
    criarObjeto({
      bufferInfo: bufEsfera,
      position: [p.x, p.s[1] * 0.6, p.z],
      rotation: [0, p.giro, 0],
      scale: p.s,
      texture: texturas.pedra,
      material: MATERIAIS.pedra,
    })
  );
}

// Tonel: cilindro marrom em pé (raio 0.4, altura 0.8)
cena.push(
  criarObjeto({
    bufferInfo: bufCilindro,
    position: [-0.2, 0.4, -2.0],
    scale: [0.4, 0.8, 0.4],
    texture: texturas.madeira,
    material: MATERIAIS.madeira,
    // Dois aros de metal em volta do tonel
    filhos: [-0.3, 0.3].map((y) =>
      criarObjeto({
        bufferInfo: bufCilindro,
        position: [0, y, 0],
        scale: [1.06, 0.08, 1.06],
        color: [0.25, 0.25, 0.28, 1],
        texture: texBranca,
        material: MATERIAIS.metal,
      })
    ),
  })
);
  
  const texChao = criarTexturaChao(gl);

  // Chão: círculo da pokébola
  cena.push(
    criarObjeto({
      bufferInfo: criarDisco(gl, 6, 64),
      position: [0, 0, 0],
      color: [1, 1, 1, 1], // branco para não tingir a textura
      texture: texChao,
    })
  );

  const texHemisferio = criarTexturaHemisferio(gl);

  // Hemisfério: "chão" da pokébola, mesmo raio do disco
  cena.push(
    criarObjeto({
      bufferInfo: criarHemisferio(gl, 6, 24, 64),
      position: [0, 0, 0],
      color: [1, 1, 1, 1],
      texture: texHemisferio,
      material: MATERIAIS.pokebola,
    })
  );

  const VELOCIDADE_PAS = 1.5; // rad/s
  const moinho = criarMoinho(gl, texturas, [-2.5, 0, 2.8]);
  cena.push(moinho.raiz);
  
  // 5. Desenho de um objeto
  function desenharObjeto(obj, viewProjection, matrizPai = m4.identity()) {
    // Matriz de mundo = matriz do pai × matriz local
    const world = m4.multiply(matrizPai, criarMatrizModelo(obj));

    if (obj.bufferInfo) {
      twgl.setBuffersAndAttributes(gl, programInfo, obj.bufferInfo);
      twgl.setUniforms(programInfo, {
        u_world: world,
        u_viewProjection: viewProjection,
        u_worldInverseTranspose: m4.transpose(m4.inverse(world)),
        u_texture: obj.texture || texBranca,
        u_color: obj.color,
        u_ambient: obj.material.ambient,
        u_diffuse: obj.material.diffuse,
        u_specular: obj.material.specular,
        u_shininess: obj.material.shininess,
      });
      twgl.drawBufferInfo(gl, obj.bufferInfo);
    }

    for (const filho of obj.filhos) {
      desenharObjeto(filho, viewProjection, world);
    }
  }
  
  // 6. Loop
  function render(timeMs) {
    const time = timeMs * 0.001;

    twgl.resizeCanvasToDisplaySize(gl.canvas);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const aspect = gl.canvas.width / gl.canvas.height;
    const projection = m4.perspective(Math.PI / 4, aspect, 0.1, 100);
    const olho = calcularOlho(time);
    const viewProjection = m4.multiply(projection, calcularView(olho));

    gl.useProgram(programInfo.program);
    twgl.setUniforms(programInfo, {
      u_lightDirection: [0.5, 1, 0.7],
      u_lightColor: [1, 1, 1],
      u_ambientLight: [1, 1, 1],
      u_viewWorldPosition: olho,
      u_lightingEnabled: luzLigada,
    });

    for (const obj of cena) {
      desenharObjeto(obj, viewProjection);
    }

    moinho.eixo.rotation[2] = time * VELOCIDADE_PAS;

    const dt = time - tempoAnterior;
  tempoAnterior = time;
  atualizarPose(personagem, POSES[poseAtual], dt);

    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
}

main().catch((erro) => console.error(erro));
