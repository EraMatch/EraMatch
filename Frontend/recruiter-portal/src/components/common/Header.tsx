import logo from '../../imports/image-eramatch.png';

export function Header() {
    return (
        <nav className="h-[72px] px-12 py-3 flex items-center justify-between border-b border-gray-200 bg-white fixed top-0 left-0 right-0 z-50">
            <img src={logo} alt="ERAMATCH" className="h-12" />
        </nav>
    );
}
