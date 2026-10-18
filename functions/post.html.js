/* AIO SEO V1 — legacy URL /post.html?id=..., if routed by Pages. */
import {handleOfficialPost} from './_aio_post_meta.js';
export const onRequestGet = handleOfficialPost;
