import bcrypt from 'bcryptjs';

const password = 'CARMEN07';
const saltRounds = 10;

const hash = await bcrypt.hash(password, saltRounds);

console.log('Password:', password);
console.log('Hash:', hash);

const isValid = await bcrypt.compare(password, hash);

console.log('Verificación:', isValid);