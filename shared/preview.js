(function () {
  function create(root) {
    const images = root.querySelectorAll('.cover-image');
    const empties = root.querySelectorAll('.empty');
    const fields = ['title', 'author', 'duration'];
    const targets = {
      title: root.querySelectorAll('.card-title'),
      author: root.querySelectorAll('.card-author'),
      duration: root.querySelectorAll('.duration')
    };

    function updateField(name) {
      const value = root.getElementById(name).value.trim();
      targets[name].forEach(node => { node.textContent = value; });
    }

    fields.forEach(name => {
      root.getElementById(name).addEventListener('input', () => updateField(name));
      updateField(name);
    });

    return {
      setImage(url) {
        images.forEach(node => {
          node.src = url || '';
          node.style.display = url ? 'block' : 'none';
        });
        empties.forEach(node => { node.style.display = url ? 'none' : 'block'; });
      }
    };
  }

  window.CoverPreview = { create };
})();
