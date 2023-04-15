function search() {
    const query = document.querySelector('#search').value;
    window.location.href = encodeURI(query.toLowerCase().trim().split(/\W/).filter(Boolean).join('_'));
}

function onLoad() {
    const article = document.querySelector('main article');
    article.innerHTML = '';
    article.append(document.querySelector('#content').content);
    document.querySelector('header form').addEventListener('submit', (event) => { event.preventDefault(); search(); });

    fetch('/@recents').then(x => x.json()).then(list => {
        const recents = document.querySelector('aside ul');
        recents.innerHTML = list.map(link => '<li>' + link.anchor(link) + '</li>');
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onLoad);
  } else {
    setTimeout(onLoad);
  }