import FicharComponent from '../components/FicharComponent.jsx';

const FicharPage = () => {
    return (
        <div className="flex flex-col sticky top-0 h-screen">
            <div className="flex-1 flex flex-col">
                <div className="flex-grow p-4 overflow-auto">
                    <FicharComponent />
                </div>
            </div>
        </div>
    );
}

export default FicharPage;
