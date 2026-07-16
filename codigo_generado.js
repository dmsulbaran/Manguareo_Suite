async function fetchUserById(userId) {
    if (typeof userId !== 'number' || userId < 1) {
        throw new Error('ID de usuario inválido');
    }

    try {
        const response = await fetch(`https://jsonplaceholder.typicode.com/users/${userId}`);
        if (!response.ok) {
            throw new Error('Error de red');
        }
        return await response.json();
    } catch (error) {
        throw error;
    }
}

// Llamadas de prueba
(async () => {
    try {
        const user = await fetchUserById(1);
        console.log(user); // Usuario exitoso
    } catch (error) {
        console.error(error.message);
    }

    try {
        const user = await fetchUserById(-1);
        console.log(user);
    } catch (error) {
        console.error(error.message); // ID inválido
    }

    try {
        const user = await fetchUserById(0);
        console.log(user);
    } catch (error) {
        console.error(error.message); // ID inválido
    }
})();