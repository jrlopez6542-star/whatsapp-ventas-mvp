const fs = require('fs');
let code = fs.readFileSync('lib/store/index.ts', 'utf8');

const newSeed = `const SEED_PRODUCTS: Product[] = [
  {
    sku: "C4T",
    name: "CAJA x4 Tradicional",
    price: 16000,
    active: true,
    description: "Caja de 4 buñuelos tradicionales dorados y crujientes",
  },
  {
    sku: "C8T",
    name: "CAJA x8 Tradicional",
    price: 32000,
    active: true,
    description: "Caja familiar de 8 buñuelos tradicionales",
  },
  {
    sku: "C4S",
    name: "CAJA x4 Surtida",
    price: 18000,
    active: true,
    description: "Caja de 4 buñuelos surtidos. Salsas a elección: Mora, Arequipe, Bocadillo, Suero Costeño.",
  },
  {
    sku: "C8S",
    name: "CAJA x8 Surtida",
    price: 36000,
    active: true,
    description: "Caja de 8 buñuelos surtidos. Salsas a elección: Mora, Arequipe, Bocadillo, Suero Costeño.",
  },
];`;

code = code.replace(/const SEED_PRODUCTS: Product\[\] = \[[\s\S]*?\];/m, newSeed);
fs.writeFileSync('lib/store/index.ts', code);
console.log("Updated lib/store/index.ts");
