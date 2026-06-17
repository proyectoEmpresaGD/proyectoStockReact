const DEFAULT_PASSWORD_LENGTH = 12;

export const generatePassword = (passwordLength = DEFAULT_PASSWORD_LENGTH) => {
    const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lowercase = 'abcdefghijkmnopqrstuvwxyz';
    const numbers = '23456789';
    const symbols = '@#$%&*-_';
    const allCharacters = `${uppercase}${lowercase}${numbers}${symbols}`;

    const requiredCharacters = [
        uppercase[Math.floor(Math.random() * uppercase.length)],
        lowercase[Math.floor(Math.random() * lowercase.length)],
        numbers[Math.floor(Math.random() * numbers.length)],
        symbols[Math.floor(Math.random() * symbols.length)],
    ];

    const remainingLength = Math.max(passwordLength, requiredCharacters.length) - requiredCharacters.length;

    const remainingCharacters = Array.from({ length: remainingLength }, () =>
        allCharacters[Math.floor(Math.random() * allCharacters.length)]
    );

    return [...requiredCharacters, ...remainingCharacters]
        .sort(() => Math.random() - 0.5)
        .join('');
};