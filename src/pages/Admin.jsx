import TranslatedText from '../i18n/TranslatedText.jsx';
function Admin() {
    return (
        <div className="container mx-auto justify-center text-center px-2 py-4">
            <h1 className="text-2xl font-bold mb-4"><TranslatedText>Admin Page</TranslatedText></h1>
            <p><TranslatedText>Welcome, admin!</TranslatedText></p>
        </div>
    );
}

export default Admin;
