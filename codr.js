function search() {
    const query = document.querySelector('#search').value;
    window.location.href = encodeURI(query.toLowerCase().trim().split(/\W/).filter(Boolean).join('_'));
}

document.addEventListener('DOMContentLoaded', () => {
    document.querySelector('main article').append(document.querySelector('#content').content);
    document.querySelector('header form').addEventListener('submit', (event) => { event.preventDefault(); search(); });

    fetch('/@recents').then(x => x.json()).then(list => {
        const recents = document.querySelector('aside ul');
        recents.innerHTML = list.map(link => '<li>' + link.anchor(link) + '</li>');
    });

});